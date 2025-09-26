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
   * Parse XML RSS feed content into structured data
   */
  async parseRssXml(xmlContent: string): Promise<RssFeed> {
    try {
      // Sanitize XML by fixing common issues with entity encoding
      const sanitizedXml = this.sanitizeXml(xmlContent);
      
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: '',
        allowBooleanAttributes: true,
        parseAttributeValue: true,
        trimValues: true,
      });
      
      const result = parser.parse(sanitizedXml);
      return result as RssFeed;
    } catch (error) {
      console.error('Error parsing RSS XML:', error);
      throw new Error('Failed to parse RSS feed');
    }
  }
  
  /**
   * Sanitize XML content to fix common parsing issues
   */
  private sanitizeXml(xmlContent: string): string {
    return xmlContent
      // Fix unescaped ampersands in URLs
      .replace(/&(?!(?:amp|lt|gt|quot|apos);)/g, '&amp;')
      // Ensure proper XML declaration
      .replace(/^[^<]*/, '')
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
      fundingAmount: this.extractFundingAmount(fullText),
      deadline: this.extractDeadline(fullText),
      location: this.extractLocation(fullText),
      program: this.extractProgram(entry),
    };
  }

  /**
   * Filter and convert RSS feed to subsidy programs
   */
  async processRssFeed(xmlContent: string): Promise<InsertSubsidyProgram[]> {
    const feed = await this.parseRssXml(xmlContent);
    
    if (!feed.feed?.entry) {
      console.warn('No entries found in RSS feed');
      return [];
    }

    const entries = Array.isArray(feed.feed.entry) ? feed.feed.entry : [feed.feed.entry];
    
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