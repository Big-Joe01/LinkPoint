/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@linkpoint/types'],
  output: 'standalone',
};

module.exports = nextConfig;
