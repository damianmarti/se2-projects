"use client";

import { useEffect, useState } from "react";
import type { NextPage } from "next";
import { BugAntIcon, ChartBarIcon, CodeBracketIcon, MagnifyingGlassIcon, StarIcon } from "@heroicons/react/24/outline";
import { RepositoryStats } from "~~/types/repository";

const Home: NextPage = () => {
  const [stats, setStats] = useState<RepositoryStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch("/api/repositories/stats");
        if (!response.ok) {
          throw new Error("Failed to fetch repository statistics");
        }
        const data = await response.json();
        setStats(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="loading loading-spinner loading-lg"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="alert alert-error max-w-md">
          <span>Error loading repository statistics: {error}</span>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center flex-col grow pt-10">
        <div className="px-5">
          <h1 className="text-center">
            <span className="block text-2xl mb-2">Projects using</span>
            <span className="block text-4xl font-bold">Scaffold-ETH 2</span>
          </h1>
        </div>

        {stats && (
          <div className="w-full max-w-6xl px-4 py-8">
            {/* Overview Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
              <div className="stat bg-base-100 rounded-lg shadow">
                <div className="stat-figure text-primary">
                  <CodeBracketIcon className="h-8 w-8" />
                </div>
                <div className="stat-title">Total Repositories</div>
                <div className="stat-value text-primary">{stats.totalRepos.toLocaleString()}</div>
              </div>

              <div className="stat bg-base-100 rounded-lg shadow">
                <div className="stat-figure text-secondary">
                  <StarIcon className="h-8 w-8" />
                </div>
                <div className="stat-title">Total Stars</div>
                <div className="stat-value text-primary">{stats.totals.totalStars.toLocaleString()}</div>
              </div>

              <div className="stat bg-base-100 rounded-lg shadow">
                <div className="stat-figure text-accent">
                  <ChartBarIcon className="h-8 w-8" />
                </div>
                <div className="stat-title">Total Forks</div>
                <div className="stat-value text-accent">{stats.totals.totalForks.toLocaleString()}</div>
              </div>

              <div className="stat bg-base-100 rounded-lg shadow">
                <div className="stat-figure text-info">
                  <BugAntIcon className="h-8 w-8" />
                </div>
                <div className="stat-title">Recent (7 days)</div>
                <div className="stat-value text-info">{stats.recentRepos.toLocaleString()}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Top Repositories by Stars */}
              <div className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <h2 className="card-title">
                    <StarIcon className="h-6 w-6" />
                    Top Repositories by Stars
                  </h2>
                  <div className="overflow-x-auto">
                    <table className="table table-zebra w-full">
                      <thead>
                        <tr>
                          <th>Repository</th>
                          <th>Stars</th>
                          <th>Forks</th>
                          <th>Source</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.topStars.map((repo, index) => (
                          <tr key={repo.full_name}>
                            <td>
                              <div className="flex items-center space-x-3">
                                <div className="font-bold">{index + 1}</div>
                                <div>
                                  <div className="font-bold">{repo.name}</div>
                                  <div className="text-sm opacity-50">{repo.owner}</div>
                                </div>
                              </div>
                            </td>
                            <td>{repo.stars.toLocaleString()}</td>
                            <td>{repo.forks.toLocaleString()}</td>
                            <td>
                              {repo.source.map((src, index) => (
                                <div key={index} className="badge badge-accent badge-sm">
                                  {src}
                                </div>
                              ))}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Source Statistics */}
              <div className="card bg-base-100 shadow-xl">
                <div className="card-body">
                  <h2 className="card-title">
                    <ChartBarIcon className="h-6 w-6" />
                    Repositories by Source
                  </h2>
                  <div className="space-y-4">
                    {stats.sourceStats.map(source => (
                      <div key={source.source} className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="badge badge-primary">{source.source}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-bold">{source.count.toLocaleString()}</div>
                          <div className="text-sm opacity-50">
                            {((source.count / stats.totalRepos) * 100).toFixed(1)}%
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Top Owners */}
            <div className="card bg-base-100 shadow-xl mt-8">
              <div className="card-body">
                <h2 className="card-title">
                  <MagnifyingGlassIcon className="h-6 w-6" />
                  Top Repository Owners
                </h2>
                <div className="overflow-x-auto">
                  <table className="table table-zebra w-full">
                    <thead>
                      <tr>
                        <th>Owner</th>
                        <th>Repositories</th>
                        <th>Total Stars</th>
                        <th>Avg Stars/Repo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.topOwners.map((owner, index) => (
                        <tr key={owner.owner}>
                          <td>
                            <div className="flex items-center space-x-3">
                              <div className="font-bold">{index + 1}</div>
                              <div className="font-bold">{owner.owner}</div>
                            </div>
                          </td>
                          <td>{owner.repo_count.toLocaleString()}</td>
                          <td>{parseInt(owner.total_stars.toString()).toLocaleString()}</td>
                          <td>
                            {Math.round(parseInt(owner.total_stars.toString()) / owner.repo_count).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default Home;
