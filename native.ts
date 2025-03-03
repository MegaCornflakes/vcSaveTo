/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { open, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { URL } from "node:url";

import { IpcMainInvokeEvent } from "electron";

function randomChars(length: number) {
    const allowedChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

    let result = "";
    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * allowedChars.length);
        result += allowedChars.charAt(randomIndex);
    }

    return result;
}

export async function saveToFolder(_event: IpcMainInvokeEvent, srcUrl: string, folderPath: string) {
    const response = await fetch(srcUrl);

    if (!response.ok) {
        return;
    }

    // Get image data as buffer
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Original file name
    const filename = basename(new URL(srcUrl).pathname);
    // Changes if file already exists
    let filenameActual = filename;

    let saved = false;
    while (!saved) {
        const path = join(folderPath, filenameActual);

        try {
            const fd = await open(path, "wx");
            await writeFile(fd, buffer);
            saved = true;
        } catch (err: any) {
            if (err.code === "EEXIST") {
                filenameActual = `${filename.split(".")[0]}-${randomChars(8)}.${filename.split(".")[1]}`;
                continue;
            }

            throw err;
        }
    }
}
