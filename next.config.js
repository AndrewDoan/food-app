/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // Next.js caches previously-visited pages client-side for ~30s by
    // default, to make back/forward navigation feel instant. That's a
    // bad tradeoff here: after editing a recipe/review, navigating back
    // to a browse page can show a stale, pre-edit snapshot until the
    // cache expires or the browser is manually refreshed. Setting this
    // to 0 means every navigation refetches fresh data instead.
    staleTimes: {
      dynamic: 0,
    },
  },
};

module.exports = nextConfig;
