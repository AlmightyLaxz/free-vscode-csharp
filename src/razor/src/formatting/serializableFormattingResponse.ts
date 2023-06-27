﻿/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { SerializableTextEdit } from '../rpc/serializableTextEdit';

export class SerializableFormattingResponse {
    constructor(public readonly edits?: SerializableTextEdit[]) {}
}
