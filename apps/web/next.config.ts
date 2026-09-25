import './load-env';
import type { NextConfig } from 'next';

const config: NextConfig = {
  transpilePackages: ['@hufu402/sdk'],
  agentRules: false,
};

export default config;
