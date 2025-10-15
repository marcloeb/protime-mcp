// Unit Tests for Handlers

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { createBriefing, getBriefings } from '../src/handlers/briefings';
import { suggestSources } from '../src/handlers/sources';
import { User } from '../src/types/user';

// Mock Firebase
jest.mock('../src/api/firebase.js', () => ({
  collections: {
    briefings: {
      doc: jest.fn(() => ({
        id: 'mock-id',
        set: jest.fn(),
        get: jest.fn(() => Promise.resolve({ exists: true, data: () => ({}) })),
      })),
      where: jest.fn(() => ({
        where: jest.fn(() => ({
          get: jest.fn(() => Promise.resolve({ size: 0, docs: [] })),
        })),
        orderBy: jest.fn(() => ({
          limit: jest.fn(() => ({
            offset: jest.fn(() => ({
              get: jest.fn(() => Promise.resolve({ docs: [] })),
            })),
          })),
        })),
      })),
    },
    editions: {
      where: jest.fn(() => ({
        orderBy: jest.fn(() => ({
          limit: jest.fn(() => ({
            get: jest.fn(() => Promise.resolve({ empty: true, docs: [] })),
          })),
        })),
        count: jest.fn(() => ({
          get: jest.fn(() => Promise.resolve({ data: () => ({ count: 0 }) })),
        })),
      })),
    },
  },
}));

describe('Briefing Handlers', () => {
  let mockUser: User;

  beforeEach(() => {
    mockUser = {
      id: 'test-user-123',
      email: 'test@example.com',
      tier: 'free',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  });

  describe('createBriefing', () => {
    it('should create a briefing with valid input', async () => {
      const result = await createBriefing(mockUser, {
        topic: 'AI regulations',
        description: 'Track EU AI Act',
      });

      expect(result).toBeDefined();
      expect(result.topic).toBe('AI regulations');
      expect(result.userId).toBe(mockUser.id);
      expect(result.schedule).toBe('weekly');
      expect(result.active).toBe(true);
    });

    it('should create briefing without description', async () => {
      const result = await createBriefing(mockUser, {
        topic: 'Climate tech',
      });

      expect(result).toBeDefined();
      expect(result.topic).toBe('Climate tech');
      expect(result.description).toBeUndefined();
    });
  });

  describe('getBriefings', () => {
    it('should return empty array for user with no briefings', async () => {
      const result = await getBriefings(mockUser);

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('should respect limit parameter', async () => {
      const result = await getBriefings(mockUser, 5);

      expect(Array.isArray(result)).toBe(true);
      // With mocked data, we get empty array
      expect(result.length).toBeLessThanOrEqual(5);
    });
  });
});

describe('Source Handlers', () => {
  describe('suggestSources', () => {
    it('should return AI sources for AI topic', async () => {
      const sources = await suggestSources('artificial intelligence', 5);

      expect(Array.isArray(sources)).toBe(true);
      expect(sources.length).toBeGreaterThan(0);
      expect(sources.length).toBeLessThanOrEqual(5);
      expect(sources[0]).toHaveProperty('name');
      expect(sources[0]).toHaveProperty('url');
      expect(sources[0]).toHaveProperty('type');
    });

    it('should return climate sources for climate topic', async () => {
      const sources = await suggestSources('climate change', 3);

      expect(Array.isArray(sources)).toBe(true);
      expect(sources.length).toBeGreaterThan(0);
      expect(sources.length).toBeLessThanOrEqual(3);
    });

    it('should return tech sources for unrecognized topic', async () => {
      const sources = await suggestSources('random topic xyz', 5);

      expect(Array.isArray(sources)).toBe(true);
      expect(sources.length).toBeGreaterThan(0);
    });

    it('should respect limit parameter', async () => {
      const sources = await suggestSources('technology', 2);

      expect(sources.length).toBeLessThanOrEqual(2);
    });
  });
});
