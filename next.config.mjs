/** @type {import('next').NextConfig} */
const nextConfig = {
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
