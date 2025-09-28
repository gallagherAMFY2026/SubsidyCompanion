import { XMLParser } from 'fast-xml-parser';
import type { SubsidyProgram, InsertSubsidyProgram } from '@shared/schema';

export interface RssEntry {
  title: string;
  id: string;
  summary: string;
  author: { name: string };
  category: { term: string };
  updated: string;
  link: { href: string };
}

export interface RssFeed {
  feed: {
    title: string;
    entry: RssEntry[];
  };
}

export class RssParser {
  /**
   * Parse XML RSS feed content into structured data with robust error handling
   */
  async parseRssXml(xmlContent: string): Promise<RssFeed> {
    try {
      // Debug: log XML structure
      console.log('XML content length:', xmlContent.length);
      console.log('XML start:', xmlContent.substring(0, 200));
      
      // Write XML to file for debugging
      const fs = await import('fs/promises');
      await fs.writeFile('/tmp/debug_rss.xml', xmlContent);
      console.log('XML written to /tmp/debug_rss.xml for debugging');
      
      // Sanitize XML by fixing common issues with entity encoding
      const sanitizedXml = this.sanitizeXml(xmlContent);
      
      // Enhanced parser configuration for better RSS/Atom compatibility
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '',
        allowBooleanAttributes: true,
        parseAttributeValue: false, // Don't parse values, keep as strings
        trimValues: true,
        preserveOrder: false,       // Use object mode, not array mode
        stopNodes: ['content', 'summary', 'description'], // Don't parse HTML content deeply
        parseTrueNumberOnly: false, // Prevent date parsing issues
        parseTagValue: true,        // Parse text content
        textNodeName: '#text',     // Handle mixed content
        ignoreNameSpace: false,     // Preserve namespaces
        removeNSPrefix: false       // Keep namespace prefixes
      });
      
      const result = parser.parse(sanitizedXml);
      console.log('Parsed XML keys:', Object.keys(result));
      
      // Debug RSS 2.0 structure
      if (result.rss) {
        console.log('RSS version:', result.rss?.version);
        console.log('Channel keys:', Object.keys(result.rss?.channel || {}));
        const items = result.rss?.channel?.item;
        if (items) {
          const itemCount = Array.isArray(items) ? items.length : 1;
          console.log('RSS 2.0 items found:', itemCount);
        }
      }
      
      // Debug Atom structure  
      if (result.feed) {
        console.log('Atom feed keys:', Object.keys(result.feed));
        console.log('Has entries:', !!result.feed.entry, 'Entry count:', Array.isArray(result.feed.entry) ? result.feed.entry.length : (result.feed.entry ? 1 : 0));
      }
      
      return result as RssFeed;
    } catch (error) {
      console.error('Error parsing RSS XML:', error);
      console.error('Parser error details:', (error as Error).message);
      console.error('XML snippet that failed:', xmlContent.substring(0, 500));
      throw new Error(`Failed to parse RSS feed: ${(error as Error).message}`);
    }
  }
  
  /**
   * Sanitize XML content to fix common parsing issues
   */
  private sanitizeXml(xmlContent: string): string {
    return xmlContent
      // Fix unescaped ampersands in URLs (but not already escaped ones)
      .replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;')
      // Fix malformed CDATA sections
      .replace(/<\!\[CDATA\[([^\]]*?)\]\]>/g, (match, content) => {
        // Escape any XML special characters in CDATA content
        return content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      })
      // Remove any null bytes that can break parsing
      .replace(/\x00/g, '')
      // Fix broken XML declarations
      .replace(/^[^<]*/, '')
      // Ensure UTF-8 encoding declaration if missing
      .replace(/^(<\?xml[^>]*?)\?>/, (match, xmlDecl) => {
        if (!xmlDecl.includes('encoding')) {
          return xmlDecl + ' encoding="UTF-8"?>';
        }
        return match;
      })
      .trim();
  }

  /**
   * Extract funding amount from text using regex patterns
   */
  private extractFundingAmount(text: string): string | null {
    // Look for patterns like "$4.77 million", "$14.6 million", "$1.7 million"
    const patterns = [
      /\$(\d+(?:\.\d+)?)\s*million/i,
      /\$(\d+(?:,\d+)*(?:\.\d+)?)/i,
      /(\d+(?:\.\d+)?)\s*million/i,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        if (text.toLowerCase().includes('million')) {
          return `$${match[1]} million`;
        }
        return `$${match[1]}`;
      }
    }
    return null;
  }

  /**
   * Extract deadline/date information from text
   */
  private extractDeadline(text: string): Date | null {
    // Look for common date patterns in Canadian government announcements
    const datePatterns = [
      /deadline[:\s]+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
      /by\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
      /until\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
      /open\s+until\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
      /applications?\s+due\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
      /submit\s+by\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4})/i,
      /(\d{4}-\d{2}-\d{2})/i, // ISO date format
      /([A-Za-z]+\s+\d{1,2},?\s+\d{4})\s+deadline/i,
    ];

    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match) {
        const dateStr = match[1];
        const parsedDate = new Date(dateStr);
        if (!isNaN(parsedDate.getTime())) {
          return parsedDate;
        }
      }
    }
    
    // For recent announcements without explicit deadlines, assume 90 days from publish
    const publishDateMatch = text.match(/(2025-\d{2}-\d{2})/i);
    if (publishDateMatch) {
      const publishDate = new Date(publishDateMatch[1]);
      const assumedDeadline = new Date(publishDate);
      assumedDeadline.setDate(assumedDeadline.getDate() + 90);
      return assumedDeadline;
    }
    
    return null;
  }

  /**
   * Extract location information from text
   */
  private extractLocation(text: string): string | null {
    // Look for Canadian provinces and territories
    const locationPatterns = [
      /(Ontario|Quebec|British Columbia|Alberta|Saskatchewan|Manitoba|Nova Scotia|New Brunswick|Newfoundland and Labrador|Prince Edward Island|Northwest Territories|Nunavut|Yukon)/i,
      /(Canada and [A-Z][a-z.]+)/i,
      /in\s+([A-Z][a-z\s]+,?\s+Canada)/i,
    ];

    for (const pattern of locationPatterns) {
      const match = text.match(pattern);
      if (match) {
        return match[1];
      }
    }
    return null;
  }

  /**
   * Determine program type from entry data
   */
  private extractProgram(entry: RssEntry): string | null {
    const text = `${entry.title} ${entry.summary}`.toLowerCase();
    
    if (text.includes('agristability') || text.includes('agri-stability')) {
      return 'AgriStability';
    }
    if (text.includes('agriinvest') || text.includes('agri-invest')) {
      return 'AgriInvest';
    }
    if (text.includes('sustainable canadian agricultural partnership') || text.includes('scap')) {
      return 'Sustainable Canadian Agricultural Partnership';
    }
    if (text.includes('resilient agricultural landscape') || text.includes('ralp')) {
      return 'Resilient Agricultural Landscape Program';
    }
    if (text.includes('local food infrastructure')) {
      return 'Local Food Infrastructure Fund';
    }
    if (text.includes('ontario agri-food research') || text.includes('oafri')) {
      return 'Ontario Agri-Food Research Initiative';
    }
    
    return null;
  }

  /**
   * Check if an RSS entry is subsidy/funding related
   */
  private isSubsidyRelated(entry: RssEntry): boolean {
    const text = `${entry.title} ${entry.summary}`.toLowerCase();
    const category = entry.category?.term?.toLowerCase() || '';

    // Keywords that indicate subsidy/funding content
    const subsidyKeywords = [
      'investing', 'investment', 'funding', 'million', 'support',
      'program', 'assistance', 'help', 'subsidy', 'grant', 
      'agristability', 'agriinvest', 'partnership', 'financial',
      'cost-share', 'benefits', 'eligible', 'applications'
    ];

    // Categories that are likely to contain subsidy info
    const relevantCategories = ['news releases', 'backgrounders'];

    // Exclude trade missions, statements, and purely administrative content
    const excludeKeywords = [
      'trade mission', 'statement by minister', 'address media',
      'visit', 'travel', 'meeting', 'conference'
    ];

    // Check if any exclude keywords are present
    for (const keyword of excludeKeywords) {
      if (text.includes(keyword)) {
        return false;
      }
    }

    // Check for subsidy keywords and relevant categories
    const hasSubsidyKeywords = subsidyKeywords.some(keyword => text.includes(keyword));
    const hasRelevantCategory = relevantCategories.includes(category);

    return hasSubsidyKeywords && hasRelevantCategory;
  }

  /**
   * Convert RSS entry to SubsidyProgram format
   */
  private convertToSubsidyProgram(entry: RssEntry): InsertSubsidyProgram {
    const fullText = `${entry.title} ${entry.summary}`;
    
    return {
      id: entry.id,
      title: entry.title,
      summary: entry.summary,
      category: entry.category?.term || 'uncategorized',
      publishedDate: new Date(entry.updated),
      url: entry.link?.href || entry.id,
      dataSource: 'rss_generic',
      sourceUrl: entry.link?.href || entry.id,
      sourceAgency: entry.author?.name || 'RSS Feed Source',
      country: 'Unknown',
      region: this.extractLocation(fullText),
      fundingAmount: this.extractFundingAmount(fullText),
      deadline: this.extractDeadline(fullText),
      location: this.extractLocation(fullText),
      program: this.extractProgram(entry),
      opportunityNumber: null,
      awardNumber: null,
      eligibilityTypes: ['farm', 'producer', 'organization'],
      fundingTypes: ['grant', 'support', 'program'],
      isHighPriority: null,
      alertReason: null,
      sourceLastModified: null,
      sourceEtag: null,
      mergedFromSources: ['rss_generic'],
      conflictResolution: null,
      dedupeKey: '' // Will be computed by deduplication service
    };
  }

  /**
   * Filter and convert RSS feed to subsidy programs
   */
  async processRssFeed(xmlContent: string): Promise<InsertSubsidyProgram[]> {
    const feed = await this.parseRssXml(xmlContent);
    
    let entries: any[] = [];
    
    // Handle both Atom feeds (feed.entry) and RSS 2.0 feeds (rss.channel.item)
    if (feed.feed?.entry) {
      // Atom feed format
      entries = Array.isArray(feed.feed.entry) ? feed.feed.entry : [feed.feed.entry];
      console.log('Processing Atom feed with', entries.length, 'entries');
    } else if (feed.rss?.channel?.item) {
      // RSS 2.0 feed format
      entries = Array.isArray(feed.rss.channel.item) ? feed.rss.channel.item : [feed.rss.channel.item];
      console.log('Processing RSS 2.0 feed with', entries.length, 'items');
      
      // Convert RSS 2.0 format to Atom-like format for consistent processing
      entries = entries.map(item => ({
        id: item.link || item.guid || `item-${Date.now()}`,
        title: item.title,
        summary: item.description,
        updated: item.pubDate,
        link: { href: item.link },
        category: { term: item.category || 'news' },
        author: { name: 'Ministry for Primary Industries' }
      }));
    } else {
      console.warn('No entries found in RSS feed - unsupported format');
      console.log('Available feed keys:', Object.keys(feed));
      if (feed.rss) {
        console.log('RSS channel keys:', Object.keys(feed.rss.channel || {}));
      }
      return [];
    }
    
    return entries
      .filter(entry => this.isSubsidyRelated(entry))
      .map(entry => this.convertToSubsidyProgram(entry))
      .filter(program => {
        // Only include programs from the last 180 days to avoid very stale data
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
        return program.publishedDate > sixMonthsAgo;
      });
  }
}

export const rssParser = new RssParser();