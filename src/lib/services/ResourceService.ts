// lib/services/ResourceService.ts
import { browser } from '$app/environment';
import { debugService } from './DebugService.js';

interface ResourceCacheEntry {
  data: string;
  timestamp: number;
  expiresAt: number;
}

/**
 * Service for managing resource loading and caching (images, SVGs)
 */
class ResourceService {
  private static readonly CACHE_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours
  private static readonly CACHE_PREFIX = 'tap3_resource_';
  private baseUrl: string = 'https://api.tap3.me';
  private cache: Map<string, ResourceCacheEntry> = new Map();
  private defaultSvg: string | null = null;
  
  constructor() {
    if (browser) {
      this.loadCacheFromStorage();
    }
  }
  
  /**
   * Set base URL for resources
   */
  setBaseUrl(url: string): void {
    this.baseUrl = url;
    debugService.info(`ResourceService: Base URL set to ${url}`);
  }
  
  /**
   * Load SVG for a card with fallback support
   */
  async loadCardSvg(svgId: string | number): Promise<string> {
    if (!svgId || svgId === 'default') {
      return this.getDefaultSvg();
    }
    
    const cacheKey = `svg_${svgId}`;
    
    // Check cache first
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      debugService.debug(`ResourceService: SVG ${svgId} loaded from cache`);
      return cached;
    }
    
    try {
      const url = `${this.baseUrl}/cards/${svgId}.svg`;
      debugService.info(`ResourceService: Loading SVG from ${url}`);
      
      const response = await fetch(url);
      if (!response.ok) {
        debugService.warn(`ResourceService: Failed to load SVG ${svgId} (${response.status}), using default`);
        return this.getDefaultSvg();
      }
      
      const svgContent = await response.text();
      
      // Cache for later use
      this.saveToCache(cacheKey, svgContent);
      
      return svgContent;
    } catch (error) {
      debugService.error(`ResourceService: Failed to load SVG ${svgId}: ${error}`);
      return this.getDefaultSvg();
    }
  }
  
  /**
   * Get default SVG content
   * This provides an empty SVG as fallback when no card design is available
   */
  private getDefaultSvg(): string {
    if (this.defaultSvg) {
      return this.defaultSvg;
    }
    
    // Create a simple placeholder SVG
    this.defaultSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 190">
      <rect width="100%" height="100%" fill="#f0f0f0" />
      <text x="50%" y="50%" font-family="Arial" font-size="14" 
        text-anchor="middle" dominant-baseline="middle" fill="#666">
        Card Design
      </text>
    </svg>`;
    
    return this.defaultSvg;
  }
  
  /**
   * Load background image with data URL conversion
   */
  async loadBackgroundImage(bgId: string | number): Promise<string> {
    if (!bgId) {
      debugService.warn('ResourceService: No background ID provided');
      return '';
    }
    
    const cacheKey = `bg_${bgId}`;
    
    // Check cache first
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      debugService.debug(`ResourceService: Background ${bgId} loaded from cache`);
      return cached;
    }
    
    try {
      const url = `${this.baseUrl}/bgs/${bgId}.png`;
      debugService.info(`ResourceService: Loading background from ${url}`);
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to load background: ${response.status}`);
      }
      
      // Convert to Data URL
      const blob = await response.blob();
      const dataUrl = await this.blobToDataURL(blob);
      
      // Cache for later use
      this.saveToCache(cacheKey, dataUrl);
      
      return dataUrl;
    } catch (error) {
      debugService.error(`ResourceService: Failed to load background ${bgId}: ${error}`);
      return '';
    }
  }
  
  /**
   * Fix URLs in CSS styles
   */
  fixCssUrls(css: string): string {
    if (!css) return '';
    
    return css.replace(
      /url\(['"]?(?:\.\/)?bgs\/([^'")]+)['"]?\)/g, 
      (match, filename) => `url('${this.baseUrl}/bgs/${filename}')`
    );
  }
  
  /**
   * Clean and normalize CSS styles
   */
  cleanupCss(css: string, model: number = 0): string {
    if (!css) return '';
    
    // Apply default background colors based on model
    let baseStyle = '';
    switch (model) {
      case 4:
        baseStyle = 'background-color: black; ';
        break;
      case 5:
        baseStyle = 'background-color: #c7252b; ';
        break;
      case 6:
        baseStyle = 'background-color: #006faf; ';
        break;
      default:
        baseStyle = 'background-color: white; ';
    }
    
    // Fix background URLs
    const fixedUrls = this.fixCssUrls(css);
    
    // Improve performance with cover instead of contain
    const improvedCss = fixedUrls
      .replace(/contain/g, 'cover')
      .replace(/\s+/g, ' ')
      .trim();
    
    return baseStyle + improvedCss;
  }
  
  /**
   * Extract resource IDs from CSS
   */
  extractResourceIds(css: string): string[] {
    if (!css) return [];
    
    const regex = /url\(['"]?(?:\.\/)?bgs\/([^'")]+)['"]?\)/g;
    const ids: string[] = [];
    let match;
    
    while ((match = regex.exec(css)) !== null) {
      if (match[1]) {
        ids.push(match[1].replace(/\.\w+$/, '')); // Remove extension
      }
    }
    
    return ids;
  }
  
  /**
   * Preload resources for a card
   */
  async preloadCardResources(css: string, svgId?: string): Promise<void> {
    const resourceIds = this.extractResourceIds(css);
    
    debugService.info(`ResourceService: Preloading ${resourceIds.length} resources for card`);
    
    try {
      // Preload backgrounds
      const bgPromises = resourceIds.map(id => this.loadBackgroundImage(id));
      
      // Preload SVG if provided
      const promises = [...bgPromises];
      if (svgId) {
        promises.push(this.loadCardSvg(svgId));
      }
      
      await Promise.allSettled(promises);
      debugService.info('ResourceService: Preloading complete');
    } catch (error) {
      debugService.error(`ResourceService: Preloading error: ${error}`);
      // Continue despite errors
    }
  }
  
  // Private methods
  
  /**
   * Convert blob to data URL
   */
  private async blobToDataURL(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Failed to convert blob to data URL'));
      reader.readAsDataURL(blob);
    });
  }
  
  /**
   * Get item from cache
   */
  private getFromCache(key: string): string | null {
    // Check memory cache first
    const entry = this.cache.get(key);
    if (entry && Date.now() < entry.expiresAt) {
      return entry.data;
    }
    
    // Then check localStorage if in browser
    if (browser) {
      try {
        const stored = localStorage.getItem(ResourceService.CACHE_PREFIX + key);
        if (stored) {
          const parsed = JSON.parse(stored) as ResourceCacheEntry;
          if (Date.now() < parsed.expiresAt) {
            // Update memory cache
            this.cache.set(key, parsed);
            return parsed.data;
          } else {
            // Remove expired entry
            localStorage.removeItem(ResourceService.CACHE_PREFIX + key);
          }
        }
      } catch (error) {
        debugService.error(`ResourceService: Cache error for ${key}: ${error}`);
      }
    }
    
    return null;
  }
  
  /**
   * Save item to cache
   */
  private saveToCache(key: string, data: string): void {
    const entry: ResourceCacheEntry = {
      data,
      timestamp: Date.now(),
      expiresAt: Date.now() + ResourceService.CACHE_EXPIRY
    };
    
    // Save to memory cache
    this.cache.set(key, entry);
    
    // Save to localStorage if in browser
    if (browser) {
      try {
        localStorage.setItem(
          ResourceService.CACHE_PREFIX + key,
          JSON.stringify(entry)
        );
      } catch (error) {
        debugService.error(`ResourceService: Failed to save to cache: ${error}`);
      }
    }
  }
  
  /**
   * Load cache from storage
   */
  private loadCacheFromStorage(): void {
    if (!browser) return;
    
    try {
      const now = Date.now();
      const keysToRemove: string[] = [];
      
      // Iterate all localStorage items with our prefix
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(ResourceService.CACHE_PREFIX)) {
          const rawData = localStorage.getItem(key);
          if (rawData) {
            try {
              const parsed = JSON.parse(rawData) as ResourceCacheEntry;
              
              // Check if entry is still valid
              if (now < parsed.expiresAt) {
                const cacheKey = key.replace(ResourceService.CACHE_PREFIX, '');
                this.cache.set(cacheKey, parsed);
              } else {
                keysToRemove.push(key);
              }
            } catch {
              keysToRemove.push(key);
            }
          } else {
            keysToRemove.push(key);
          }
        }
      }
      
      // Clean up expired entries
      keysToRemove.forEach(key => {
        localStorage.removeItem(key);
      });
      
      debugService.info(`ResourceService: Loaded ${this.cache.size} resources from cache, removed ${keysToRemove.length} expired items`);
    } catch (error) {
      debugService.error(`ResourceService: Failed to load cache from storage: ${error}`);
    }
  }
  
  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
    this.defaultSvg = null;
    
    if (browser) {
      try {
        // Only remove items with our prefix
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const key = localStorage.key(i);
          if (key?.startsWith(ResourceService.CACHE_PREFIX)) {
            localStorage.removeItem(key);
          }
        }
        debugService.info('ResourceService: Cache cleared');
      } catch (error) {
        debugService.error(`ResourceService: Failed to clear cache: ${error}`);
      }
    }
  }
}

// Export a singleton instance
export const resourceService = new ResourceService();