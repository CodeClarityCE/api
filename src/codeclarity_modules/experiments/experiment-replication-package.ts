/** The replication package of a Published results version (ADR 0007). Pure. */
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { crc32, createDeflateRaw, createInflateRaw } from "node:zlib";

import type { ProvenanceBlock } from "./experiment-results";

/** One file of the package; opened once, while the package is built. */
export interface PackageFile {
  name: string;
  open: () => Readable | string | Promise<string>;
}

/** One snapshot and the commit it pinned, null when it has none. */
export interface ManifestCommit {
  rank: number;
  full_name: string;
  grid_date: string;
  status: string;
  branch: string | null;
  commit_hash: string | null;
  committed_at: Date | null;
}

export interface ManifestInput {
  experiment_id: string;
  experiment_name: string;
  metric_version: number;
  published_on: Date;
  provenance: ProvenanceBlock;
  commits: ManifestCommit[];
}

/** manifest.json: what is needed to assess how the results were produced. */
export function manifestJson(input: ManifestInput): string {
  const { provenance } = input;
  return JSON.stringify(
    {
      experiment_id: input.experiment_id,
      experiment_name: input.experiment_name,
      metric_version: input.metric_version,
      published_on: input.published_on,
      api_version: provenance.api_version,
      analyzer_steps: provenance.analyzer_steps,
      knowledge_start: provenance.knowledge_start,
      knowledge_end: provenance.knowledge_end,
      knowledge_changed: provenance.knowledge_changed,
      bootstrap: provenance.bootstrap,
      commits: input.commits,
    },
    null,
    2,
  );
}

export interface CitationInput {
  experiment_name: string;
  metric_version: number;
  published_on: Date;
  /** The experiment's creator, null when no longer recorded */
  author: { first_name: string; last_name: string } | null;
}

/** A JSON string is a valid YAML double-quoted scalar. */
const yamlString = (value: string): string => JSON.stringify(value);

function citationAuthor(author: CitationInput["author"]): string[] {
  const fields = [
    ["family-names", author?.last_name.trim()],
    ["given-names", author?.first_name.trim()],
  ].filter(([, value]) => value);
  if (fields.length === 0) {
    return [`  - name: ${yamlString("Author not recorded")}`];
  }
  return fields.map(
    ([key, value], index) =>
      `${index === 0 ? "  - " : "    "}${key}: ${yamlString(value!)}`,
  );
}

/** CITATION.cff (Citation File Format 1.2.0) of a Published results version. */
export function citationCff(input: CitationInput): string {
  const title = `${input.experiment_name} (replication package, metric version ${input.metric_version})`;
  const released = input.published_on.toISOString().slice(0, 10);
  return [
    `cff-version: ${yamlString("1.2.0")}`,
    `message: ${yamlString("If you use this data, please cite it using these metadata.")}`,
    `type: ${yamlString("dataset")}`,
    `title: ${yamlString(title)}`,
    `version: ${yamlString(String(input.metric_version))}`,
    `date-released: ${yamlString(released)}`,
    "authors:",
    ...citationAuthor(input.author),
    "",
  ].join("\n");
}

/** A finished package: the archive bytes and their SHA-256. */
export interface ReplicationPackage {
  archive: Buffer;
  checksum: string;
}

const ZIP32_MAX = 0xffffffff;
const DEFLATE = 8;
const VERSION_NEEDED = 20;
/** 1980-01-01, the earliest DOS date: entries carry no real timestamp */
const DOS_DATE = 0x21;

interface DeflatedFile {
  name: Buffer;
  crc: number;
  size: number;
  data: Buffer;
}

async function deflateFile(file: PackageFile): Promise<DeflatedFile> {
  const opened = await file.open();
  const source =
    typeof opened === "string"
      ? Readable.from([Buffer.from(opened, "utf8")])
      : opened;
  let crc = 0;
  let size = 0;
  const chunks: Buffer[] = [];
  await pipeline(
    source,
    async function* (input: AsyncIterable<Buffer | string>) {
      for await (const chunk of input) {
        const bytes = Buffer.from(chunk as Buffer);
        crc = crc32(bytes, crc);
        size += bytes.length;
        yield bytes;
      }
    },
    createDeflateRaw({ level: 9 }),
    async (deflated: AsyncIterable<Buffer>) => {
      for await (const chunk of deflated) chunks.push(chunk);
    },
  );
  return {
    name: Buffer.from(file.name, "utf8"),
    crc,
    size,
    data: Buffer.concat(chunks),
  };
}

/** The header fields a local entry and its central directory record share. */
function commonHeader(file: DeflatedFile): Buffer {
  const header = Buffer.alloc(26);
  header.writeUInt16LE(VERSION_NEEDED, 0);
  header.writeUInt16LE(0, 2);
  header.writeUInt16LE(DEFLATE, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(DOS_DATE, 8);
  header.writeUInt32LE(file.crc, 10);
  header.writeUInt32LE(file.data.length, 14);
  header.writeUInt32LE(file.size, 18);
  header.writeUInt16LE(file.name.length, 22);
  header.writeUInt16LE(0, 24);
  return header;
}

function signature(value: number): Buffer {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value);
  return bytes;
}

function assembleZip(files: DeflatedFile[]): Buffer {
  const parts: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    if (file.size > ZIP32_MAX || offset > ZIP32_MAX) {
      throw new Error(
        `Replication package too large at ${file.name.toString()}`,
      );
    }
    const common = commonHeader(file);
    const local = [signature(0x04034b50), common, file.name, file.data];
    parts.push(...local);

    const record = Buffer.alloc(14);
    record.writeUInt32LE(offset, 10);
    directory.push(
      signature(0x02014b50),
      Buffer.from([VERSION_NEEDED, 0]),
      common,
      record,
      file.name,
    );
    offset += local.reduce((total, part) => total + part.length, 0);
  }

  const directoryBytes = Buffer.concat(directory);
  if (offset + directoryBytes.length > ZIP32_MAX) {
    throw new Error("Replication package too large");
  }
  const end = Buffer.alloc(18);
  end.writeUInt16LE(files.length, 4);
  end.writeUInt16LE(files.length, 6);
  end.writeUInt32LE(directoryBytes.length, 8);
  end.writeUInt32LE(offset, 12);
  return Buffer.concat([...parts, directoryBytes, signature(0x06054b50), end]);
}

/**
 * Builds the ZIP of the given files, in order, one at a time.
 * @throws If a file fails to open or read, or the ZIP would pass 4 GiB
 */
export async function buildReplicationPackage(
  files: readonly PackageFile[],
): Promise<ReplicationPackage> {
  const deflated: DeflatedFile[] = [];
  for (const file of files) deflated.push(await deflateFile(file));
  const archive = assembleZip(deflated);
  return {
    archive,
    checksum: createHash("sha256").update(archive).digest("hex"),
  };
}

/** The contents of one file of a stored package, or null if it has no such file. */
export function packageFileStream(
  archive: Buffer,
  name: string,
): Readable | null {
  const end = archive.length - 22;
  const size = archive.readUInt32LE(end + 12);
  let record = archive.readUInt32LE(end + 16);
  const directoryEnd = record + size;
  while (record < directoryEnd) {
    const nameLength = archive.readUInt16LE(record + 28);
    const entry = archive.toString(
      "utf8",
      record + 46,
      record + 46 + nameLength,
    );
    if (entry === name) {
      const local = archive.readUInt32LE(record + 42);
      const start = local + 30 + archive.readUInt16LE(local + 26);
      const deflated = archive.subarray(
        start,
        start + archive.readUInt32LE(record + 20),
      );
      return Readable.from([deflated]).pipe(createInflateRaw());
    }
    record += 46 + nameLength;
  }
  return null;
}
