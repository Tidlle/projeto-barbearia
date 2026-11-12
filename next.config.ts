import type { NextConfig } from "next";

// Este app é inteiramente dinâmico (banco + sessão a cada requisição),
// então usamos o modelo clássico de renderização em vez de Cache Components.
const nextConfig: NextConfig = {
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
