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
      // /docs still served the legacy Intent-Swap DEX documentation (mainnet
      // contract, $/mo pricing) — a different product. Send it to the real
      // ZenFix API reference instead of exposing the wrong product publicly.
      { source: "/docs", destination: "/api-docs", permanent: false },
    ];
  },
  experimental: {
    // The pilot read-only surfaces read the frozen sandbox snapshot from
    // .zenfix-data/pilot-validation/ at request time via fs. Those files are
    // not statically imported, so Next's output file tracing would drop them
    // from the serverless bundle. Include them explicitly for each surface.
    outputFileTracingIncludes: {
      "/command-center": ["./.zenfix-data/pilot-validation/**"],
      "/payruns": ["./.zenfix-data/pilot-validation/**"],
      "/payruns/[id]": ["./.zenfix-data/pilot-validation/**"],
      "/pilot-validation": ["./.zenfix-data/pilot-validation/**"],
    },
  },
};

export default nextConfig;
