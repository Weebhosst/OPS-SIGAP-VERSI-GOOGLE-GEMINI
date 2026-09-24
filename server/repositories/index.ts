import { config } from '../config';
import type { RepositoryBundle } from './contracts';

export const repositories: RepositoryBundle = config.databaseProvider === 'postgres'
  ? (await import('./postgresRepositories')).postgresRepositories
  : (await import('./jsonRepositories')).jsonRepositories;
