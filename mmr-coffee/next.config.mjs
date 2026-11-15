/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["three"],
  images: { formats: ["image/avif", "image/webp"] },
  // Set STATIC_EXPORT=1 to produce a fully static build in ./out (any static host works).
  ...(process.env.STATIC_EXPORT === "1" ? { output: "export", images: { unoptimized: true } } : {}),
};
export default nextConfig;
