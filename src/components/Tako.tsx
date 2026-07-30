// Tako — the mascot. Rendered as the illustrated character art (public/tako.png).
// Same prop contract as before (size / className / thinking) so every existing
// call site keeps working untouched. `thinking` reuses the gentle bob animation.
//
// We use a plain <img> pointing at /tako.png (in the /public folder).
// Next.js serves everything in /public at the root path, so this works in
// both local dev and any deployment (Vercel, Netlify, etc.) without config.
export function Tako({
  size = 40,
  className = "",
  thinking = false,
}: {
  size?: number;
  className?: string;
  thinking?: boolean;
}) {
  return (
    <img
      src="/tako.png"
      alt="Tako the octopus mascot"
      aria-hidden="true"
      draggable={false}
      width={size}
      height={size}
      className={`tako-img select-none ${thinking ? "animate-bob" : ""} ${className}`}
      style={{ width: size, height: size, objectFit: "contain" }}
    />
  );
}
