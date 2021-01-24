/*---------------------------------------------------------------------------------------------
*  Copyright (c) Microsoft Corporation. All rights reserved.
*  Licensed under the MIT License. See License.txt in the project root for license information.
*--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';

import { should, expect } from 'chai';
import { activateCSharpExtension, isRazorWorkspace } from './integrationHelpers';
import testAssetWorkspace from './testAssets/testAssetWorkspace';
import { poll, assertWithPoll, pollDoesNotHappen } from './poll';

const chai = require('chai');
chai.use(require('chai-arrays'));
chai.use(require('chai-fs'));

function setDiagnosticWorkspaceLimit(to: number | null) {
    let csharpConfig = vscode.workspace.getConfiguration('csharp');
    return csharpConfig.update('maxProjectFileCountForDiagnosticAnalysis', to);
}

suite(`DiagnosticProvider: ${testAssetWorkspace.description}`, function () {
    let fileUri: vscode.Uri;
    let secondaryFileUri: vscode.Uri;
    let razorFileUri: vscode.Uri;
    let virtualRazorFileUri: vscode.Uri;

    suiteSetup(async function () {
        should();

        await activateCSharpExtension();
        await testAssetWorkspace.restore();

        let fileName = 'diagnostics.cs';
        let secondaryFileName = 'secondaryDiagnostics.cs';
        let projectDirectory = testAssetWorkspace.projects[0].projectDirectoryPath;

        fileUri = vscode.Uri.file(path.join(projectDirectory, fileName));
        secondaryFileUri = vscode.Uri.file(path.join(projectDirectory, secondaryFileName));
        razorFileUri = vscode.Uri.file(path.join(projectDirectory, 'Pages', 'ErrorHaver.razor'));
        virtualRazorFileUri = vscode.Uri.file(razorFileUri.fsPath + '__virtual.cs');
    });

    suite("razor workspace", () => {
        suiteSetup(async function () {
            should();

            // These tests only run on the BasicRazorApp2_1 solution
            if (!isRazorWorkspace(vscode.workspace)) {
                this.skip();
            }

            await activateCSharpExtension();
            await testAssetWorkspace.restore();
            await vscode.commands.executeCommand("vscode.open", razorFileUri);
        });

        test("Razor shouldn't give diagnostics for virtual files", async function () {

            await pollDoesNotHappen(() => vscode.languages.getDiagnostics(), 5 * 1000, 500, function (res) {
                const virtual = res.find(r => r[0].fsPath === virtualRazorFileUri.fsPath);

                if (!virtual) {
                    return false;
                }

                const diagnosticsList = virtual[1];
                if (diagnosticsList.some(diag => diag.code == 'CS0103')) {
                    return true;
                }
                else {
                    return false;
                }
            });
        });

        suiteTeardown(async () => {
            await testAssetWorkspace.cleanupWorkspace();
        });
    });

    suite.skip("small workspace (based on maxProjectFileCountForDiagnosticAnalysis setting)", () => {
        suiteSetup(async function () {
            should();

            // These tests don't run on the BasicRazorApp2_1 solution
            if (isRazorWorkspace(vscode.workspace)) {
                this.skip();
            }

            await activateCSharpExtension();
            await testAssetWorkspace.restore();
            await vscode.commands.executeCommand("vscode.open", fileUri);
        });

        test("Returns any diagnostics from file", async function () {
            if (process.env.OMNISHARP_DRIVER === 'lsp') {
                this.skip();
            }

            await assertWithPoll(
                () => vscode.languages.getDiagnostics(fileUri),
                /*duration*/ 30 * 1000,
                /*step*/ 500,
                res => expect(res.length).to.be.greaterThan(0));
        });

        test("Return unnecessary tag in case of unused variable", async function () {
            if (process.env.OMNISHARP_DRIVER === 'lsp') {
                this.skip();
            }

            let result = await poll(
                () => vscode.languages.getDiagnostics(fileUri),
                /*duration*/ 30 * 1000,
                /*step*/ 500,
                result => result.find(x => x.code === "CS0219") != undefined);

            let cs0219 = result.find(x => x.code === "CS0219");
            expect(cs0219).to.not.be.undefined;
            if (cs0219.tags) // not currently making it through lsp 100% of the time
            expect(cs0219.tags).to.include(vscode.DiagnosticTag.Unnecessary);
        });

        test("Return unnecessary tag in case of unnesessary using", async function () {
            if (process.env.OMNISHARP_DRIVER === 'lsp') {
                this.skip();
            }

            let result = await poll(
                () => vscode.languages.getDiagnostics(fileUri),
                /*duration*/ 30 * 1000,
                /*step*/ 500,
                result => result.find(x => x.code === "CS8019") != undefined);

            let cs8019 = result.find(x => x.code === "CS8019");
            expect(cs8019).to.not.be.undefined;
            if (cs8019.tags) // not currently making it through lsp 100% of the time
            expect(cs8019.tags).to.include(vscode.DiagnosticTag.Unnecessary);
        });

        test("Return fadeout diagnostics like unused variables based on roslyn analyzers", async function () {
            if (process.env.OMNISHARP_DRIVER === 'lsp') {
                this.skip();
            }

            let result = await poll(
                () => vscode.languages.getDiagnostics(fileUri),
                /*duration*/ 30 * 1000,
                /*step*/ 500,
                result => result.find(x => x.code === "IDE0059") != undefined);

            let ide0059 = result.find(x => x.code === "IDE0059");
            expect(ide0059).to.not.be.undefined;
            if (ide0059.tags) // not currently making it through lsp 100% of the time
            expect(ide0059.tags).to.include(vscode.DiagnosticTag.Unnecessary);
        });

        test("On small workspaces also show/fetch closed document analysis results", async function () {
            if (process.env.OMNISHARP_DRIVER === 'lsp') {
                this.skip();
            }

            await assertWithPoll(() => vscode.languages.getDiagnostics(secondaryFileUri), 15 * 1000, 500, res => expect(res.length).to.be.greaterThan(0));
        });

        suiteTeardown(async () => {
            await testAssetWorkspace.cleanupWorkspace();
        });
    });

    suite("large workspace (based on maxProjectFileCountForDiagnosticAnalysis setting)", () => {
        suiteSetup(async function () {
            should();

            // These tests don't run on the BasicRazorApp2_1 solution
            if (isRazorWorkspace(vscode.workspace)) {
                this.skip();
            }

            await setDiagnosticWorkspaceLimit(1);
            await testAssetWorkspace.restore();
            await activateCSharpExtension();
        });

        test("When workspace is count as 'large', then only show/fetch diagnostics from open documents", async function () {

            // This is to trigger manual cleanup for diagnostics before test because we modify max project file count on fly.
            await vscode.commands.executeCommand("vscode.open", secondaryFileUri);
            await vscode.commands.executeCommand("vscode.open", fileUri);

            await assertWithPoll(() => vscode.languages.getDiagnostics(fileUri), 10 * 1000, 500, openFileDiag => expect(openFileDiag.length).to.be.greaterThan(0));
            await assertWithPoll(() => vscode.languages.getDiagnostics(secondaryFileUri), 10 * 1000, 500, secondaryDiag => expect(secondaryDiag.length).to.be.eq(0));
        });

        suiteTeardown(async () => {
            await testAssetWorkspace.cleanupWorkspace();
        });
    });
});
