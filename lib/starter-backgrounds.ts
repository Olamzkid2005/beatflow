/**
 * Original backgrounds that ship with the studio. They exist so a release is
 * never blocked on sourcing a photo: First Light, Pulse and Grid need a
 * background image, and nothing in this local-first app searches the web or
 * uploads a picture to find one.
 *
 * The files are the same procedurally generated, text-free 1920×1080 images
 * documented in `public/images/orbital/README.md`. Choosing one fetches it from
 * this origin, wraps it in a File, and feeds the normal decode/render path, so a
 * starter behaves exactly like a manually chosen photo (including downscaling).
 */

export type StarterBackground = {
  /** Stable key and download name. */
  id: string;
  /** Short label shown under the thumbnail. */
  name: string;
  /** Same-origin path to the bundled JPEG. */
  src: string;
  /** One line explaining the look. */
  description: string;
};

export const STARTER_BACKGROUNDS: readonly StarterBackground[] = [
  {
    id: "starter-silver-fog",
    name: "Silver fog",
    src: "/images/orbital/background-monochrome.jpg",
    description: "Soft charcoal fog — closest to the Orbital atmosphere.",
  },
  {
    id: "starter-obsidian",
    name: "Obsidian",
    src: "/images/orbital/background-obsidian.jpg",
    description: "Near-black field for quiet, high-contrast type.",
  },
  {
    id: "starter-umber",
    name: "Umber dust",
    src: "/images/orbital/background-umber.jpg",
    description: "Warm muted dust for a softer, editorial look.",
  },
];

/**
 * Downloads a bundled starter and returns it as a File. Failures are reported
 * as user-facing text; a missing starter is not a reason to crash the studio.
 */
export async function loadStarterBackground(
  starter: StarterBackground,
  fetcher: typeof fetch = fetch,
): Promise<File> {
  let response: Response;
  try {
    response = await fetcher(starter.src);
  } catch {
    throw new Error(`Could not load the ${starter.name} background. Check your connection and try again.`);
  }
  if (!response.ok) {
    throw new Error(`Could not load the ${starter.name} background (${response.status}).`);
  }
  const blob = await response.blob();
  if (blob.size === 0) {
    throw new Error(`The ${starter.name} background is empty. Choose another image.`);
  }
  return new File([blob], `${starter.id}.jpg`, {
    type: blob.type || "image/jpeg",
  });
}
