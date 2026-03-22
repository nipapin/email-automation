import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Согласовано с лимитом PDF в api/emails/route.js */
export const MAX_OFFICE_INPUT_BYTES = 12 * 1024 * 1024;

const CONVERT_TIMEOUT_MS = 120_000;

function libreOfficeCommand() {
  const fromEnv = process.env.LIBREOFFICE_PATH?.trim();
  if (fromEnv) return fromEnv;
  return "libreoffice";
}

/**
 * Конвертация буфера Office → PDF (LibreOffice headless).
 * На Windows можно задать LIBREOFFICE_PATH к soffice.exe.
 * @returns {Promise<Buffer|null>} null при ошибке или слишком большом файле
 */
export async function convertOfficeBufferToPdf(buffer, originalFilename) {
  if (!buffer?.length) return null;
  if (buffer.length > MAX_OFFICE_INPUT_BYTES) {
    console.warn(
      `[convert-office-to-pdf] skip: file too large (${originalFilename})`
    );
    return null;
  }

  const ext =
    path.extname(originalFilename || "") ||
    ".docx";
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "email-lo-"));
  const inputName = `input${ext}`;
  const inputPath = path.join(tmpDir, inputName);

  try {
    await writeFile(inputPath, buffer);

    const cmd = libreOfficeCommand();
    const args = [
      "--headless",
      "--norestore",
      "--nolockcheck",
      "--convert-to",
      "pdf",
      "--outdir",
      tmpDir,
      inputPath,
    ];

    await execFileAsync(cmd, args, {
      timeout: CONVERT_TIMEOUT_MS,
      maxBuffer: 20 * 1024 * 1024,
      windowsHide: true,
    });

    const pdfName = path.basename(inputName, ext) + ".pdf";
    const pdfPath = path.join(tmpDir, pdfName);
    const pdfBuf = await readFile(pdfPath);
    if (!pdfBuf?.length) {
      console.warn(
        `[convert-office-to-pdf] empty PDF output: ${originalFilename}`
      );
      return null;
    }
    return pdfBuf;
  } catch (e) {
    console.warn(
      `[convert-office-to-pdf] failed (${originalFilename}):`,
      e.message || e
    );
    return null;
  } finally {
    try {
      await rm(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}
