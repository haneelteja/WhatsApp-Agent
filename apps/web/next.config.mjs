/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@alphabot/shared'],
  experimental: {
    // Tree-shake lucide-react — avoids bundling all 1500+ icons when only a subset is used.
    optimizePackageImports: ['lucide-react'],
  },
};

export default nextConfig;
