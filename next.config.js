/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // Privy v3 declares optional peer deps for Solana / Farcaster integrations
    // we don't use. They're never imported at runtime in our flow, but webpack
    // still tries to resolve them during the build. Alias them to false so
    // resolution succeeds with an empty synthetic module.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@solana/wallet-adapter-react": false,
      "@farcaster/mini-app-solana": false,
      "@farcaster/miniapp-sdk": false,
    };
    return config;
  },
};

module.exports = nextConfig;
