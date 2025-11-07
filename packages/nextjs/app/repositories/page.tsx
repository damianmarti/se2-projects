"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowDownTrayIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  GlobeAltIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/outline";
import { Repository } from "~~/types/repository";

interface RepositoriesResponse {
  repositories: Repository[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    limit: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
  sorting: {
    sortBy: string;
    sortOrder: string;
  };
  search: string;
}

const RepositoriesPage = () => {
  const [data, setData] = useState<RepositoriesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [sortBy, setSortBy] = useState("id");
  const [sortOrder, setSortOrder] = useState("desc");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchRepositories = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: currentPage.toString(),
        limit: "30",
        sortBy,
        sortOrder,
        ...(debouncedSearch && { search: debouncedSearch }),
      });

      const response = await fetch(`/api/repositories?${params}`);
      if (!response.ok) {
        throw new Error("Failed to fetch repositories");
      }
      const result = await response.json();
      setData(result);
      setIsInitialLoad(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  // Debounce search input
  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setCurrentPage(1);
    }, 400);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [search]);

  useEffect(() => {
    fetchRepositories();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, sortBy, sortOrder, debouncedSearch]);

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("desc");
    }
    setCurrentPage(1);
  };

  const handleSearch = (value: string) => {
    setSearch(value);
  };

  const handleExport = async () => {
    try {
      const response = await fetch("/api/repositories/export");
      if (!response.ok) {
        throw new Error("Failed to export repositories");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `repositories-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Export error:", err);
      alert("Failed to export repositories. Please try again.");
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortBy !== field) return null;
    return sortOrder === "asc" ? <ChevronUpIcon className="h-4 w-4" /> : <ChevronDownIcon className="h-4 w-4" />;
  };

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="alert alert-error max-w-md">
          <span>Error loading repositories: {error}</span>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="loading loading-spinner loading-lg"></div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
          <h1 className="text-3xl font-bold">All Repositories</h1>
          <button className="btn btn-primary btn-sm" onClick={handleExport}>
            <ArrowDownTrayIcon className="h-5 w-5 mr-2" />
            Export to CSV
          </button>
        </div>

        {/* Search */}
        <div className="flex items-center gap-4">
          <div className="form-control max-w-md flex-1">
            <div className="relative">
              <input
                type="text"
                placeholder="Search repositories..."
                className="input input-bordered w-full pr-10"
                value={search}
                onChange={e => handleSearch(e.target.value)}
              />
              {loading && !isInitialLoad ? (
                <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                  <div className="loading loading-spinner loading-sm"></div>
                </div>
              ) : (
                <MagnifyingGlassIcon className="absolute right-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              )}
            </div>
          </div>
          {data && (
            <div className="text-sm text-base-content/70 whitespace-nowrap">
              {data.pagination.totalCount.toLocaleString()}{" "}
              {data.pagination.totalCount === 1 ? "repository" : "repositories"} found
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div
        className={`card bg-base-100 shadow-xl transition-opacity ${loading && !isInitialLoad ? "opacity-60" : "opacity-100"}`}
      >
        <div className="card-body p-0">
          <div className="overflow-x-auto">
            <table className="table table-zebra w-full">
              <thead>
                <tr className="border-b-2 border-base-300">
                  <th className="border-r border-base-300/50 last:border-r-0">
                    <button className="btn btn-ghost btn-sm flex items-center gap-2" onClick={() => handleSort("name")}>
                      Repository
                      <SortIcon field="name" />
                    </button>
                  </th>
                  <th className="border-r border-base-300/50 last:border-r-0">
                    <button
                      className="btn btn-ghost btn-sm flex items-center gap-2"
                      onClick={() => handleSort("owner")}
                    >
                      Owner
                      <SortIcon field="owner" />
                    </button>
                  </th>
                  <th className="border-r border-base-300/50 last:border-r-0">
                    <button
                      className="btn btn-ghost btn-sm flex items-center gap-2"
                      onClick={() => handleSort("stars")}
                    >
                      Stars
                      <SortIcon field="stars" />
                    </button>
                  </th>
                  <th className="border-r border-base-300/50 last:border-r-0">
                    <button
                      className="btn btn-ghost btn-sm flex items-center gap-2"
                      onClick={() => handleSort("forks")}
                    >
                      Forks
                      <SortIcon field="forks" />
                    </button>
                  </th>
                  <th className="border-r border-base-300/50 last:border-r-0">
                    <button
                      className="btn btn-ghost btn-sm flex items-center gap-2"
                      onClick={() => handleSort("created_at")}
                    >
                      Created
                      <SortIcon field="created_at" />
                    </button>
                  </th>
                  <th className="border-r border-base-300/50 last:border-r-0">
                    <button
                      className="btn btn-ghost btn-sm flex items-center gap-2"
                      onClick={() => handleSort("last_seen")}
                    >
                      Last Seen
                      <SortIcon field="last_seen" />
                    </button>
                  </th>
                  <th className="w-12"></th>
                </tr>
              </thead>
              <tbody>
                {data.repositories.map(repo => (
                  <tr key={repo.id} className="border-b border-base-300/50">
                    <td className="border-r border-base-300/50 last:border-r-0">
                      <div className="flex items-center space-x-3">
                        <div>
                          <div className="font-bold">
                            <a
                              href={repo.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="link text-base-content hover:text-primary flex items-center space-x-1 transition-colors"
                              title={`View ${repo.full_name} on GitHub`}
                            >
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                              </svg>
                              <span>{repo.name}</span>
                            </a>
                          </div>
                          <div className="text-sm text-base-content/60">{repo.full_name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="border-r border-base-300/50 last:border-r-0">
                      <div className="font-medium text-base-content">{repo.owner}</div>
                    </td>
                    <td className="border-r border-base-300/50 last:border-r-0">
                      <div className="font-semibold text-base-content">{repo.stars.toLocaleString()}</div>
                    </td>
                    <td className="border-r border-base-300/50 last:border-r-0">
                      <div className="font-semibold text-base-content">{repo.forks.toLocaleString()}</div>
                    </td>
                    <td className="border-r border-base-300/50 last:border-r-0">
                      <div className="text-sm text-base-content">{new Date(repo.created_at).toLocaleDateString()}</div>
                    </td>
                    <td className="border-r border-base-300/50 last:border-r-0">
                      <div className="text-sm text-base-content">{new Date(repo.last_seen).toLocaleDateString()}</div>
                    </td>
                    <td>
                      {repo.homepage && (
                        <a
                          href={repo.homepage}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center p-2"
                          title={`Visit ${repo.homepage}`}
                        >
                          <GlobeAltIcon className="h-5 w-5 text-base-content/70 hover:text-primary transition-colors" />
                        </a>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Pagination */}
      <div className="flex justify-center mt-8">
        <div className="btn-group">
          <button className="btn" onClick={() => setCurrentPage(1)} disabled={!data.pagination.hasPrev}>
            ««
          </button>
          <button className="btn" onClick={() => setCurrentPage(currentPage - 1)} disabled={!data.pagination.hasPrev}>
            «
          </button>

          {/* Page numbers */}
          {Array.from({ length: Math.min(5, data.pagination.totalPages) }, (_, i) => {
            const startPage = Math.max(1, data.pagination.currentPage - 2);
            const pageNum = startPage + i;

            if (pageNum > data.pagination.totalPages) return null;

            return (
              <button
                key={pageNum}
                className={`btn ${pageNum === data.pagination.currentPage ? "btn-active" : ""}`}
                onClick={() => setCurrentPage(pageNum)}
              >
                {pageNum}
              </button>
            );
          })}

          <button className="btn" onClick={() => setCurrentPage(currentPage + 1)} disabled={!data.pagination.hasNext}>
            »
          </button>
          <button
            className="btn"
            onClick={() => setCurrentPage(data.pagination.totalPages)}
            disabled={!data.pagination.hasNext}
          >
            »»
          </button>
        </div>
      </div>

      {/* Loading overlay - only show on initial load */}
      {loading && isInitialLoad && (
        <div className="fixed inset-0 bg-black bg-opacity-20 flex items-center justify-center z-50">
          <div className="bg-base-100 rounded-lg p-4 shadow-lg">
            <div className="loading loading-spinner loading-md"></div>
            <div className="text-sm mt-2 text-center">Loading...</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RepositoriesPage;
