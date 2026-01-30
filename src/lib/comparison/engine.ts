/**
 * AI Visual Comparison Engine
 * 
 * Feature #3: AI visual comparison engine
 * 
 * Semantic comparison between Figma designs and live screenshots using vision AI.
 * This is the core differentiator - understands context, not just pixel diffs.
 */

import { readFile } from 'fs/promises';
import { basename } from 'path';

// ============================================================================
// Types
// ============================================================================

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export interface DifferenceLocation {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VisualDifference {
  type: 'typography' | 'color' | 'spacing' | 'layout' | 'content' | 'imagery' | 'missing' | 'extra';
  severity: Severity;
  element?: string;
  description: string;
  figmaValue?: string;
  liveValue?: string;
  location?: DifferenceLocation;
  suggestion?: string;
}

export interface ComparisonResult {
  matchScore: number; // 0-100
  timestamp: string;
  figmaImage: string;
  liveImage: string;
  differences: VisualDifference[];
  annotations: string[];
  processingTime: number;
  model: string;
}

export interface ComparisonOptions {
  /** AI model to use */
  model?: 'gpt-4-vision' | 'gpt-4o' | 'claude-opus' | 'claude-sonnet' | 'gemini-flash';
  /** API key (or uses env var) */
  apiKey?: string;
  /** Sensitivity level */
  sensitivity?: 'strict' | 'normal' | 'lenient';
  /** Focus areas */
  focus?: ('typography' | 'color' | 'spacing' | 'layout' | 'content')[];
  /** Ignore minor differences below this pixel threshold */
  ignoreThreshold?: number;
  /** Custom prompt additions */
  customPrompt?: string;
}

// ============================================================================
// AI Provider Interfaces
// ============================================================================

interface AIProvider {
  name: string;
  compare(
    figmaImage: Buffer,
    liveImage: Buffer,
    options: ComparisonOptions
  ): Promise<AIComparisonResponse>;
}

interface AIComparisonResponse {
  matchScore: number;
  differences: VisualDifference[];
  annotations: string[];
  rawResponse?: string;
}

// ============================================================================
// OpenAI Provider (GPT-4 Vision)
// ============================================================================

class OpenAIProvider implements AIProvider {
  name = 'openai';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async compare(
    figmaImage: Buffer,
    liveImage: Buffer,
    options: ComparisonOptions
  ): Promise<AIComparisonResponse> {
    const prompt = this.buildPrompt(options);
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: options.model === 'gpt-4o' ? 'gpt-4o' : 'gpt-4-vision-preview',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${figmaImage.toString('base64')}`,
                  detail: 'high',
                },
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${liveImage.toString('base64')}`,
                  detail: 'high',
                },
              },
            ],
          },
        ],
        max_tokens: 4096,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    const data = await response.json() as any;
    const content = data.choices[0].message.content;
    
    return this.parseResponse(content);
  }

  private buildPrompt(options: ComparisonOptions): string {
    const sensitivity = options.sensitivity || 'normal';
    const focusAreas = options.focus || ['typography', 'color', 'spacing', 'layout', 'content'];
    
    return `You are a UX fidelity expert analyzing visual differences between a Figma design (first image) and a live website screenshot (second image).

Compare these two images and identify visual differences. The Figma design is the source of truth.

SENSITIVITY LEVEL: ${sensitivity}
${sensitivity === 'strict' ? '- Flag all differences, even minor ones' : ''}
${sensitivity === 'normal' ? '- Flag significant differences that affect user experience' : ''}
${sensitivity === 'lenient' ? '- Only flag major differences that significantly impact the design' : ''}

FOCUS AREAS: ${focusAreas.join(', ')}

For each difference found, categorize by:
- TYPE: typography, color, spacing, layout, content, imagery, missing, extra
- SEVERITY: critical (broken/wrong), high (noticeable), medium (minor), low (nitpick)

Return a JSON object with this exact structure:
{
  "matchScore": <number 0-100>,
  "differences": [
    {
      "type": "<type>",
      "severity": "<severity>",
      "element": "<CSS selector or description>",
      "description": "<what's different>",
      "figmaValue": "<expected value>",
      "liveValue": "<actual value>",
      "suggestion": "<how to fix>"
    }
  ],
  "annotations": ["<high-level observation 1>", "<observation 2>"]
}

Be specific and actionable. Focus on differences that matter to users.
${options.customPrompt || ''}`;
  }

  private parseResponse(content: string): AIComparisonResponse {
    try {
      const parsed = JSON.parse(content);
      return {
        matchScore: Math.min(100, Math.max(0, parsed.matchScore || 0)),
        differences: (parsed.differences || []).map((d: any) => ({
          type: d.type || 'layout',
          severity: d.severity || 'medium',
          element: d.element,
          description: d.description || '',
          figmaValue: d.figmaValue,
          liveValue: d.liveValue,
          suggestion: d.suggestion,
        })),
        annotations: parsed.annotations || [],
        rawResponse: content,
      };
    } catch (error) {
      console.error('Failed to parse AI response:', content);
      throw new Error('Failed to parse AI comparison response');
    }
  }
}

// ============================================================================
// Anthropic Provider (Claude)
// ============================================================================

class AnthropicProvider implements AIProvider {
  name = 'anthropic';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async compare(
    figmaImage: Buffer,
    liveImage: Buffer,
    options: ComparisonOptions
  ): Promise<AIComparisonResponse> {
    const prompt = this.buildPrompt(options);
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: options.model === 'claude-opus' ? 'claude-opus-4-20250514' : 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/png',
                  data: figmaImage.toString('base64'),
                },
              },
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/png',
                  data: liveImage.toString('base64'),
                },
              },
              { type: 'text', text: prompt },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic API error: ${error}`);
    }

    const data = await response.json() as any;
    const content = data.content[0].text;
    
    return this.parseResponse(content);
  }

  private buildPrompt(options: ComparisonOptions): string {
    // Similar to OpenAI prompt
    const sensitivity = options.sensitivity || 'normal';
    
    return `Compare these two images: the first is a Figma design (source of truth), the second is a live website screenshot.

Identify visual differences and return a JSON object:
{
  "matchScore": <0-100>,
  "differences": [{"type": "typography|color|spacing|layout|content|imagery|missing|extra", "severity": "critical|high|medium|low", "element": "...", "description": "...", "figmaValue": "...", "liveValue": "...", "suggestion": "..."}],
  "annotations": ["..."]
}

Sensitivity: ${sensitivity}. Be specific and actionable.
${options.customPrompt || ''}`;
  }

  private parseResponse(content: string): AIComparisonResponse {
    // Extract JSON from response (Claude might include explanation text)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in Claude response');
    }
    
    const parsed = JSON.parse(jsonMatch[0]);
    return {
      matchScore: Math.min(100, Math.max(0, parsed.matchScore || 0)),
      differences: parsed.differences || [],
      annotations: parsed.annotations || [],
      rawResponse: content,
    };
  }
}

// ============================================================================
// Comparison Engine
// ============================================================================

export class ComparisonEngine {
  private provider: AIProvider;
  private defaultOptions: ComparisonOptions;

  constructor(options: ComparisonOptions = {}) {
    this.defaultOptions = {
      model: options.model || 'gpt-4o',
      sensitivity: options.sensitivity || 'normal',
      focus: options.focus || ['typography', 'color', 'spacing', 'layout', 'content'],
      ignoreThreshold: options.ignoreThreshold || 2,
      ...options,
    };

    // Initialize provider based on model
    const apiKey = this.getApiKey(options);
    
    if (this.defaultOptions.model?.startsWith('claude')) {
      this.provider = new AnthropicProvider(apiKey);
    } else {
      this.provider = new OpenAIProvider(apiKey);
    }
  }

  private getApiKey(options: ComparisonOptions): string {
    if (options.apiKey) return options.apiKey;
    
    const model = options.model || 'gpt-4o';
    if (model.startsWith('claude')) {
      const key = process.env.ANTHROPIC_API_KEY;
      if (!key) throw new Error('ANTHROPIC_API_KEY not set');
      return key;
    } else {
      const key = process.env.OPENAI_API_KEY;
      if (!key) throw new Error('OPENAI_API_KEY not set');
      return key;
    }
  }

  /**
   * Compare a Figma image with a live screenshot
   */
  async compare(
    figmaImagePath: string,
    liveImagePath: string,
    options?: Partial<ComparisonOptions>
  ): Promise<ComparisonResult> {
    const opts = { ...this.defaultOptions, ...options };
    const startTime = Date.now();

    console.log(`[Comparison] Comparing images using ${opts.model}...`);
    
    // Load images
    const [figmaImage, liveImage] = await Promise.all([
      readFile(figmaImagePath),
      readFile(liveImagePath),
    ]);

    // Run AI comparison
    const aiResult = await this.provider.compare(figmaImage, liveImage, opts);
    
    const processingTime = Date.now() - startTime;
    console.log(`[Comparison] Complete in ${processingTime}ms - Match: ${aiResult.matchScore}%`);

    return {
      matchScore: aiResult.matchScore,
      timestamp: new Date().toISOString(),
      figmaImage: figmaImagePath,
      liveImage: liveImagePath,
      differences: aiResult.differences,
      annotations: aiResult.annotations,
      processingTime,
      model: opts.model || 'gpt-4o',
    };
  }

  /**
   * Compare with buffers directly
   */
  async compareBuffers(
    figmaImage: Buffer,
    liveImage: Buffer,
    options?: Partial<ComparisonOptions>
  ): Promise<Omit<ComparisonResult, 'figmaImage' | 'liveImage'>> {
    const opts = { ...this.defaultOptions, ...options };
    const startTime = Date.now();

    const aiResult = await this.provider.compare(figmaImage, liveImage, opts);
    
    return {
      matchScore: aiResult.matchScore,
      timestamp: new Date().toISOString(),
      differences: aiResult.differences,
      annotations: aiResult.annotations,
      processingTime: Date.now() - startTime,
      model: opts.model || 'gpt-4o',
    };
  }

  /**
   * Get severity counts from differences
   */
  static summarizeDifferences(differences: VisualDifference[]): Record<Severity, number> {
    const counts: Record<Severity, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };
    
    for (const diff of differences) {
      counts[diff.severity]++;
    }
    
    return counts;
  }

  /**
   * Check if comparison passes thresholds
   */
  static passesThresholds(
    result: ComparisonResult,
    thresholds: {
      minScore?: number;
      maxCritical?: number;
      maxHigh?: number;
      maxMedium?: number;
    }
  ): { passes: boolean; reasons: string[] } {
    const reasons: string[] = [];
    const counts = this.summarizeDifferences(result.differences);
    
    if (thresholds.minScore !== undefined && result.matchScore < thresholds.minScore) {
      reasons.push(`Match score ${result.matchScore}% below threshold ${thresholds.minScore}%`);
    }
    
    if (thresholds.maxCritical !== undefined && counts.critical > thresholds.maxCritical) {
      reasons.push(`${counts.critical} critical issues (max: ${thresholds.maxCritical})`);
    }
    
    if (thresholds.maxHigh !== undefined && counts.high > thresholds.maxHigh) {
      reasons.push(`${counts.high} high severity issues (max: ${thresholds.maxHigh})`);
    }
    
    if (thresholds.maxMedium !== undefined && counts.medium > thresholds.maxMedium) {
      reasons.push(`${counts.medium} medium severity issues (max: ${thresholds.maxMedium})`);
    }
    
    return {
      passes: reasons.length === 0,
      reasons,
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

export function createComparisonEngine(options?: ComparisonOptions): ComparisonEngine {
  return new ComparisonEngine(options);
}
