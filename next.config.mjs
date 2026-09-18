/** @type {import('next').NextConfig} */
const nextConfig = {
  // The ZenFix home is /zenfix/workspace (the Overview). The bare /zenfix and a
  // natural /zenfix/overview guess both 404'd with no way back in — send them to
  // the Overview instead of a dead end. (workspace itself redirects to sign-in
  // when unauthenticated, so this is safe pre-auth.)
  async redirects() {
    return [
      { source: "/zenfix", destination: "/zenfix/workspace", permanent: false },
      { source: "/zenfix/overview", destination: "/zenfix/workspace", permanent: false },
      // /docs previously served the legacy Intent-Swap DEX documentation (a
      // different product), now removed. Keep the redirect so the old URL lands on
      // the real ZenFix API reference rather than a 404.
      { source: "/docs", destination: "/api-docs", permanent: false },
    ];
  },
};

export default nextConfig;
