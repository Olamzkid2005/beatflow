/**
 * One owner for the upload artifact. A rendered MP4 carries the ID of the
 * render that produced it, so discarding or replacing that render can clear
 * the upload selection without touching a file the owner chose manually.
 */

export type UploadSelection = {
  file: File;
  /** Present only when the file came from a render handoff. */
  artifactId: string | null;
};

export function chooseFile(file: File | null): UploadSelection | null {
  return file ? { file, artifactId: null } : null;
}

export function adoptArtifact(file: File, artifactId: string): UploadSelection {
  return { file, artifactId };
}

/** Clears the selection only when it still refers to the released render. */
export function releaseArtifact(
  selection: UploadSelection | null,
  artifactId: string,
): UploadSelection | null {
  return selection?.artifactId === artifactId ? null : selection;
}

/** Upload, render handoff and discard must not overlap. */
export function canChangeArtifact(uploading: boolean): boolean {
  return !uploading;
}
