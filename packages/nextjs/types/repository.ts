export interface Repository {
  id: number;
  full_name: string;
  name: string;
  owner: string;
  url: string;
  homepage?: string;
  stars: number;
  forks: number;
  created_at: string;
  updated_at: string;
  last_seen: string;
  saved_at: string;
  source: string;
}

export interface RepositoryStats {
  totalRepos: number;
  sourceStats: Array<{
    source: string;
    count: number;
  }>;
  topStars: Array<{
    full_name: string;
    name: string;
    owner: string;
    stars: number;
    forks: number;
    url: string;
    source: string;
  }>;
  recentRepos: number;
  totals: {
    totalStars: number;
    totalForks: number;
  };
  topOwners: Array<{
    owner: string;
    repo_count: number;
    total_stars: string;
  }>;
}
