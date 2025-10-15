// Schema Validation Tests

import { describe, it, expect } from '@jest/globals';
import {
  CreateBriefingSchema,
  GetBriefingsSchema,
  UpdateBriefingSchema,
  SuggestSourcesSchema,
} from '../src/schemas/tools';

describe('Tool Schemas', () => {
  describe('CreateBriefingSchema', () => {
    it('should validate valid briefing creation', () => {
      const input = {
        topic: 'AI regulations',
        description: 'Track EU AI Act updates',
      };

      const result = CreateBriefingSchema.parse(input);
      expect(result.topic).toBe('AI regulations');
      expect(result.description).toBe('Track EU AI Act updates');
    });

    it('should allow missing description', () => {
      const input = {
        topic: 'Climate tech',
      };

      const result = CreateBriefingSchema.parse(input);
      expect(result.topic).toBe('Climate tech');
      expect(result.description).toBeUndefined();
    });

    it('should reject topic that is too short', () => {
      const input = {
        topic: 'AI',
      };

      expect(() => CreateBriefingSchema.parse(input)).toThrow();
    });

    it('should reject topic that is too long', () => {
      const input = {
        topic: 'A'.repeat(101),
      };

      expect(() => CreateBriefingSchema.parse(input)).toThrow();
    });
  });

  describe('GetBriefingsSchema', () => {
    it('should apply default values', () => {
      const input = {};

      const result = GetBriefingsSchema.parse(input);
      expect(result.limit).toBe(10);
      expect(result.offset).toBe(0);
    });

    it('should validate custom limit and offset', () => {
      const input = {
        limit: 20,
        offset: 5,
      };

      const result = GetBriefingsSchema.parse(input);
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(5);
    });

    it('should reject negative offset', () => {
      const input = {
        offset: -1,
      };

      expect(() => GetBriefingsSchema.parse(input)).toThrow();
    });

    it('should reject limit > 50', () => {
      const input = {
        limit: 51,
      };

      expect(() => GetBriefingsSchema.parse(input)).toThrow();
    });
  });

  describe('UpdateBriefingSchema', () => {
    it('should validate schedule update', () => {
      const input = {
        briefingId: '123e4567-e89b-12d3-a456-426614174000',
        settings: {
          schedule: 'daily',
        },
      };

      const result = UpdateBriefingSchema.parse(input);
      expect(result.settings.schedule).toBe('daily');
    });

    it('should validate sources update', () => {
      const input = {
        briefingId: '123e4567-e89b-12d3-a456-426614174000',
        settings: {
          sources: [
            'https://example.com/feed',
            'https://another.com/rss',
          ],
        },
      };

      const result = UpdateBriefingSchema.parse(input);
      expect(result.settings.sources).toHaveLength(2);
    });

    it('should reject invalid schedule value', () => {
      const input = {
        briefingId: '123e4567-e89b-12d3-a456-426614174000',
        settings: {
          schedule: 'hourly', // Not allowed
        },
      };

      expect(() => UpdateBriefingSchema.parse(input)).toThrow();
    });

    it('should reject invalid UUID', () => {
      const input = {
        briefingId: 'not-a-uuid',
        settings: {
          schedule: 'daily',
        },
      };

      expect(() => UpdateBriefingSchema.parse(input)).toThrow();
    });
  });

  describe('SuggestSourcesSchema', () => {
    it('should validate topic with default limit', () => {
      const input = {
        topic: 'climate change',
      };

      const result = SuggestSourcesSchema.parse(input);
      expect(result.topic).toBe('climate change');
      expect(result.limit).toBe(5);
    });

    it('should validate custom limit', () => {
      const input = {
        topic: 'AI',
        limit: 10,
      };

      const result = SuggestSourcesSchema.parse(input);
      expect(result.limit).toBe(10);
    });

    it('should reject topic that is too short', () => {
      const input = {
        topic: 'AI',
      };

      expect(() => SuggestSourcesSchema.parse(input)).toThrow();
    });

    it('should reject limit > 20', () => {
      const input = {
        topic: 'technology',
        limit: 21,
      };

      expect(() => SuggestSourcesSchema.parse(input)).toThrow();
    });
  });
});
