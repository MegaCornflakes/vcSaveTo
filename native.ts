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

export async function saveToFolder(_event: IpcMainInvokeEvent, srcUrl: string, folderPath: string, filename?: string) {
    const response = await fetch(srcUrl);

    if (!response.ok) {
        return;
    }

    // Get image data as buffer
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Original file name
    if (!filename) {
        filename = basename(new URL(srcUrl).pathname);
    }

    // Make sure filename won't break anything
    filename = filename.trim().replace(/[\\/:*?"<>|]/g, "");
    if (filename === "" || filename === "." || filename === "..") {
        throw new Error("Invalid filename", { cause: "filename" });
    }

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
