const { PrismaPlugin } = require("@prisma/nextjs-monorepo-workaround-plugin");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Copies the Prisma query engines next to the server bundle so the file
  // tracer finds them in this pnpm monorepo layout. Server builds only:
  // the engines must never be bundled for the browser.
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.plugins.push(new PrismaPlugin());
    }
    return config;
  },
};

module.exports = nextConfig;
