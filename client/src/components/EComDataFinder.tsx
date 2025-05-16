import { useState, useEffect } from "react";
import { Search, Filter, Mail, Download, FileSpreadsheet, Loader2 } from "lucide-react";

interface Website {
  title: string;
  link: string;
  isDomainActive?: boolean;
  isShopify?: boolean;
  isFastLoading?: boolean;
  error?: boolean;
}

const STORAGE_KEYS = {
  FULL_RESULTS: "ecom_finder_full_results",
  FILTERED_RESULTS: "ecom_finder_filtered_results",
  DOMAIN_ACTIVE: "ecom_finder_domain_active",
  SHOPIFY: "ecom_finder_shopify",
  FAST_LOADING: "ecom_finder_fast_loading"
};

export default function EComDataFinder() {
  const [keyword, setKeyword] = useState("");
  const [region, setRegion] = useState("");
  const [count, setCount] = useState("100");
  const [industryKeyword, setIndustryKeyword] = useState("");

  const [domainActive, setDomainActive] = useState(false);
  const [onlyShopify, setOnlyShopify] = useState(false);
  const [fastLoading, setFastLoading] = useState(false);
  const [excludeWebsites, setExcludeWebsites] = useState("");

  const [fullResults, setFullResults] = useState<Website[]>([]);
  const [websiteData, setWebsiteData] = useState<Website[]>([]);
  const [loading, setLoading] = useState(false);
  const [checkingFilters, setCheckingFilters] = useState(false);
  const [error, setError] = useState("");
  const [phase, setPhase] = useState("idle"); // idle, fetching, checking, ready

  const sampleData: Website[] = [
    {
      title: "Irish Clothing",
      link: "https://www.theirishstore.com/irish-clothing",
      isDomainActive: true,
      isShopify: false,
      isFastLoading: true
    },
    {
      title: "Dunnes Stores: Home",
      link: "https://www.dunnesstores.com/",
      isDomainActive: true,
      isShopify: false,
      isFastLoading: true
    },
    {
      title: "Pamela Scott",
      link: "https://www.pamelascott.com/",
      isDomainActive: true,
      isShopify: true,
      isFastLoading: false
    },
    {
      title: "Born Clothing",
      link: "https://bornclothing.ie/",
      isDomainActive: true,
      isShopify: true,
      isFastLoading: true
    },
    {
      title: "Very Ireland",
      link: "https://www.very.ie/",
      isDomainActive: false,
      isShopify: false,
      isFastLoading: false
    }
  ];

  // Initialize from localStorage on first load
  useEffect(() => {
    try {
      const savedFullResults = localStorage.getItem(STORAGE_KEYS.FULL_RESULTS);
      const savedFilteredResults = localStorage.getItem(STORAGE_KEYS.FILTERED_RESULTS);
      
      if (savedFullResults) {
        const parsedFullResults = JSON.parse(savedFullResults);
        setFullResults(parsedFullResults);
        
        // If we have filtered results, use those for display
        if (savedFilteredResults) {
          setWebsiteData(JSON.parse(savedFilteredResults));
        } else {
          setWebsiteData(parsedFullResults);
        }
        
        // Set phase to ready since we already have data
        setPhase("ready");
      }
    } catch (err) {
      console.error("Error loading data from localStorage:", err);
    }
  }, []);

  // Function to check if a website is valid (simulating the checkSite endpoint but locally)
  const checkWebsite = async (url: string) => {
    try {
      // Simulate network request with a short delay (200-800ms)
      await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 600));
      
      // For demo purposes, generate somewhat random results
      // In a real app, you would make actual fetch requests to check
      const isDomainActive = Math.random() > 0.2;
      const isShopify = url.includes("shopify") || Math.random() > 0.7;
      const isFastLoading = Math.random() > 0.4;
      
      return { isDomainActive, isShopify, isFastLoading, error: false };
    } catch (err) {
      return { isDomainActive: false, isShopify: false, isFastLoading: false, error: true };
    }
  };

  // Function to fetch websites
  const fetchWebsites = async () => {
    setPhase("fetching");
    setLoading(true);
    setError("");
    
    // Clear all localStorage data for a fresh start
    Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
    
    // Also clear the current state data
    setWebsiteData([]);
    setFullResults([]);
    
    try {
      // Make API call to get websites with correct parameters
      const response = await fetch("http://localhost:8787/getWebsites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: industryKeyword,
          region: region,
          count: parseInt(count) || 100
        })
      });
      
      // Parse response (or use sample data if API fails)
      let rawData: Website[] = [];
      try {
        rawData = await response.json();
      } catch (err) {
        console.warn("Error parsing API response, using sample data");
      }
      
      const initialData = rawData && rawData.length > 0 ? rawData : sampleData;
      
      // Show initial data before enrichment
      setWebsiteData(initialData);
      setFullResults(initialData);
      
      // Move to checking phase
      setPhase("checking");
      setLoading(false);
      setCheckingFilters(true);
      
      // Enrich all websites with additional data
      const enrichedDataPromises = initialData.map(async (site) => {
        // Check each website
        const checkResult = await checkWebsite(site.link);
        
        // Return enriched website data
        return {
          ...site,
          isDomainActive: checkResult.isDomainActive,
          isShopify: checkResult.isShopify,
          isFastLoading: checkResult.isFastLoading,
          error: checkResult.error
        };
      });
      
      // Wait for all checks to complete
      const enrichedData = await Promise.all(enrichedDataPromises);
      
      // Update state with fully enriched data
      setFullResults(enrichedData);
      setWebsiteData(enrichedData);
      
      // Save to localStorage
      localStorage.setItem(STORAGE_KEYS.FULL_RESULTS, JSON.stringify(enrichedData));
      localStorage.setItem(STORAGE_KEYS.FILTERED_RESULTS, JSON.stringify(enrichedData));
      
      // Save specific filter results
      const domainActiveResults = enrichedData.filter(site => site.isDomainActive);
      const shopifyResults = enrichedData.filter(site => site.isShopify);
      const fastLoadingResults = enrichedData.filter(site => site.isFastLoading);
      
      localStorage.setItem(STORAGE_KEYS.DOMAIN_ACTIVE, JSON.stringify(domainActiveResults));
      localStorage.setItem(STORAGE_KEYS.SHOPIFY, JSON.stringify(shopifyResults));
      localStorage.setItem(STORAGE_KEYS.FAST_LOADING, JSON.stringify(fastLoadingResults));
      
    } catch (err) {
      console.error("Error fetching websites:", err);
      setError("Failed to fetch websites. Using sample data instead.");
      
      // Use sample data as fallback
      setFullResults(sampleData);
      setWebsiteData(sampleData);
      
      // Save sample data to localStorage
      localStorage.setItem(STORAGE_KEYS.FULL_RESULTS, JSON.stringify(sampleData));
    } finally {
      setCheckingFilters(false);
      setPhase("ready");
    }
  };

  // Function to apply filters (no API calls, just client-side filtering)
  const applyFilters = () => {
    // Start with the full dataset
    let filtered = [...fullResults];
    
    // Apply domain active filter
    if (domainActive) {
      filtered = filtered.filter(site => site.isDomainActive);
    }
    
    // Apply Shopify filter
    if (onlyShopify) {
      filtered = filtered.filter(site => site.isShopify);
    }
    
    // Apply fast loading filter
    if (fastLoading) {
      filtered = filtered.filter(site => site.isFastLoading);
    }
    
    // Apply excluded websites filter
    if (excludeWebsites.trim()) {
      const excluded = excludeWebsites
        .split(",")
        .map(term => term.trim().toLowerCase());
      
      filtered = filtered.filter(site => 
        !excluded.some(term => site.link.toLowerCase().includes(term))
      );
    }
    
    // Update state and save to localStorage
    setWebsiteData(filtered);
    localStorage.setItem(STORAGE_KEYS.FILTERED_RESULTS, JSON.stringify(filtered));
  };

  // Function to fetch email IDs (placeholder)
  const fetchEmails = () => {
    console.log("Fetching emails");
    // Implement email fetching logic here
  };

  // Function to export results to CSV
  const exportToCsv = () => {
    if (websiteData.length === 0) return;
    
    // Create CSV content
    const headers = ["Title", "URL", "Domain Active", "Shopify", "Fast Loading"];
    const rows = websiteData.map(site => [
      site.title,
      site.link,
      site.isDomainActive ? "Yes" : "No",
      site.isShopify ? "Yes" : "No",
      site.isFastLoading ? "Yes" : "No"
    ]);
    
    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.join(","))
    ].join("\n");
    
    // Create and trigger download
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "ecom_websites.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-white min-h-screen text-gray-800">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center mb-6 gap-2">
          <Search className="text-gray-600" />
          <h1 className="text-xl font-semibold">E-Com Data Finder</h1>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Fetch Websites Section */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h2 className="font-medium mb-4">Fetch Websites</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Country</label>
                <select
                  className="w-full p-2 bg-white border border-gray-300 rounded"
                  value={region}
                  onChange={(e) => setRegion(e.target.value)}
                  disabled={loading || checkingFilters}
                >
                  <option value="">Select country</option>
                  <option value="United States">United States</option>
                  <option value="Canada">Canada</option>
                  <option value="United Kingdom">United Kingdom</option>
                  <option value="Ireland">Ireland</option>
                  <option value="India">India</option>
                  <option value="Australia">Australia</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">State/city keyword</label>
                <input
                  type="text"
                  className="w-full p-2 bg-white border border-gray-300 rounded"
                  placeholder="Texas"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  disabled={loading || checkingFilters}
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">Industry keyword</label>
                <input
                  type="text"
                  className="w-full p-2 bg-white border border-gray-300 rounded"
                  placeholder="Eyeglasses store"
                  value={industryKeyword}
                  onChange={(e) => setIndustryKeyword(e.target.value)}
                  disabled={loading || checkingFilters}
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">Count</label>
                <input
                  type="number"
                  className="w-full p-2 bg-white border border-gray-300 rounded"
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  disabled={loading || checkingFilters}
                />
              </div>

              <button
                className="w-full flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 p-2 rounded text-white disabled:bg-gray-400"
                onClick={fetchWebsites}
                disabled={loading || checkingFilters}
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
                {phase === "fetching" ? "Fetching Websites..." : 
                 phase === "checking" ? "Checking Filters..." : 
                 "Fetch Websites"}
              </button>
            </div>
          </div>

          {/* Filter Section */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h2 className="font-medium mb-4">Filter Websites</h2>
            <div className="space-y-4">
              <div className="bg-gray-100 p-3 rounded">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={domainActive}
                    onChange={() => setDomainActive(!domainActive)}
                    disabled={checkingFilters}
                  />
                  <span>Domain Active</span>
                </label>
              </div>

              <div className="bg-gray-100 p-3 rounded">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={onlyShopify}
                    onChange={() => setOnlyShopify(!onlyShopify)}
                    disabled={checkingFilters}
                  />
                  <span>Only Shopify websites</span>
                </label>
              </div>

              <div className="bg-gray-100 p-3 rounded">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    className="rounded"
                    checked={fastLoading}
                    onChange={() => setFastLoading(!fastLoading)}
                    disabled={checkingFilters}
                  />
                  <span>Loads within 5 secs</span>
                </label>
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">Exclude the websites</label>
                <input
                  type="text"
                  className="w-full p-2 bg-white border border-gray-300 rounded"
                  placeholder="Comma separated substrings"
                  value={excludeWebsites}
                  onChange={(e) => setExcludeWebsites(e.target.value)}
                  disabled={checkingFilters}
                />
              </div>

              <button
                className="w-full flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 p-2 rounded text-white disabled:bg-gray-400"
                onClick={applyFilters}
                disabled={fullResults.length === 0 || checkingFilters}
              >
                <Filter size={18} />
                Apply Filters
              </button>
            </div>
          </div>

          {/* Fetch Email IDs Section */}
          <div className="border border-gray-200 rounded-lg p-4">
            <h2 className="font-medium mb-4">Fetch Email IDs</h2>
            <div className="space-y-4">
              <div className="border-2 border-dashed border-gray-300 p-6 rounded flex flex-col items-center justify-center">
                <FileSpreadsheet size={24} className="text-gray-400 mb-2" />
                <p className="text-sm text-gray-600">Drop your CSV file here or</p>
                <div className="flex gap-2 mt-2">
                  <div className="text-gray-600 text-sm">Websites_filtered1.csv</div>
                  <button className="text-sm text-blue-600 hover:text-blue-800">
                    Browse Files
                  </button>
                </div>
              </div>

              <button
                className="w-full flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 p-2 rounded text-white disabled:bg-gray-400"
                onClick={fetchEmails}
                disabled={websiteData.length === 0 || loading || checkingFilters}
              >
                <Mail size={18} />
                Fetch Email IDs
              </button>
            </div>
          </div>
        </div>

        {/* Results Section */}
        <div className="mt-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-medium">
              Results 
              {phase === "checking" && (
                <span className="text-sm text-gray-500 ml-2">
                  (Checking and enriching data...)
                </span>
              )}
              {websiteData.length > 0 && phase === "ready" && (
                <span className="text-sm text-gray-500 ml-2">
                  ({websiteData.length} websites)
                </span>
              )}
            </h2>
            <button
              className="flex items-center gap-2 bg-gray-200 hover:bg-gray-300 px-4 py-1 rounded text-sm disabled:bg-gray-100 disabled:text-gray-400"
              onClick={exportToCsv}
              disabled={websiteData.length === 0 || loading || checkingFilters}
            >
              <Download size={16} />
              Export as CSV
            </button>
          </div>

          {error && <div className="text-red-600 mb-4">{error}</div>}

          {phase === "checking" && (
            <div className="flex items-center justify-center p-4 text-gray-600">
              <Loader2 size={24} className="animate-spin mr-2" />
              <span>Checking website filters and enriching data...</span>
            </div>
          )}

          <div className="border border-gray-200 rounded overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-100 text-left">
                <tr>
                  <th className="p-3">Website / Email ID</th>
                  <th className="p-3 hidden md:table-cell">Status</th>
                </tr>
              </thead>
              <tbody>
                {websiteData.length > 0 ? (
                  websiteData.map((item, index) => (
                    <tr key={index} className="border-t border-gray-200">
                      <td className="p-3">
                        <div className="font-medium">{item.title}</div>
                        <div className="text-sm text-blue-600">{item.link}</div>
                        <div className="text-xs text-gray-500 md:hidden mt-1">
                          {item.isDomainActive !== undefined && (
                            <span className="mr-2">
                              Active: {item.isDomainActive ? "✅" : "❌"}
                            </span>
                          )}
                          {item.isShopify !== undefined && (
                            <span className="mr-2">
                              Shopify: {item.isShopify ? "✅" : "❌"}
                            </span>
                          )}
                          {item.isFastLoading !== undefined && (
                            <span>
                              Fast: {item.isFastLoading ? "✅" : "❌"}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-3 hidden md:table-cell">
                        <div className="flex gap-3">
                          <span className={`px-2 py-1 rounded text-xs ${
                            item.isDomainActive ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
                          }`}>
                            {item.isDomainActive ? "Active" : "Inactive"}
                          </span>
                          <span className={`px-2 py-1 rounded text-xs ${
                            item.isShopify ? "bg-blue-100 text-blue-800" : "bg-gray-100 text-gray-800"
                          }`}>
                            {item.isShopify ? "Shopify" : "Non-Shopify"}
                          </span>
                          <span className={`px-2 py-1 rounded text-xs ${
                            item.isFastLoading ? "bg-purple-100 text-purple-800" : "bg-yellow-100 text-yellow-800"
                          }`}>
                            {item.isFastLoading ? "Fast" : "Slow"}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={2} className="p-3 text-gray-500 text-center">
                      {loading ? (
                        <div className="flex items-center justify-center">
                          <Loader2 size={20} className="animate-spin mr-2" />
                          <span>Loading websites...</span>
                        </div>
                      ) : phase === "checking" ? (
                        <div className="flex items-center justify-center">
                          <Loader2 size={20} className="animate-spin mr-2" />
                          <span>Checking website data...</span>
                        </div>
                      ) : (
                        "No data available. Use the form above to fetch websites."
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}