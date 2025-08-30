import { describe, it, expect, beforeEach } from 'vitest';
import { NoSuchModelError } from '@ai-sdk/provider';
import { createGooseWeb, gooseWeb } from './goose-web-provider.js';
import { GooseWebLanguageModel } from './goose-web-language-model.js';

describe('GooseWebProvider', () => {
  describe('createGooseWeb', () => {
    it('should create provider with default settings', () => {
      const provider = createGooseWeb();
      expect(typeof provider).toBe('function');
      expect(typeof provider.languageModel).toBe('function');
      expect(typeof provider.chat).toBe('function');
      expect(typeof provider.textEmbeddingModel).toBe('function');
      expect(typeof provider.imageModel).toBe('function');
    });

    it('should create provider with custom settings', () => {
      const provider = createGooseWeb({
        wsUrl: 'ws://custom:9000/ws',
        sessionId: 'custom-session',
        connectionTimeout: 60000,
      });
      expect(typeof provider).toBe('function');
    });

    it('should create language model with valid model ID', () => {
      const provider = createGooseWeb();
      const model = provider('goose');
      
      expect(model).toBeInstanceOf(GooseWebLanguageModel);
      expect(model.modelId).toBe('goose');
      expect(model.provider).toBe('goose-web');
    });

    it('should create language model with custom model ID', () => {
      const provider = createGooseWeb();
      const model = provider('custom-goose-model');
      
      expect(model).toBeInstanceOf(GooseWebLanguageModel);
      expect(model.modelId).toBe('custom-goose-model');
    });

    it('should merge provider and model settings', () => {
      const provider = createGooseWeb({
        wsUrl: 'ws://provider:8000/ws',
        connectionTimeout: 30000,
      });
      
      const model = provider('goose', {
        sessionId: 'model-session',
        responseTimeout: 60000,
      });
      
      // Settings should be merged (provider + model specific)
      expect(model.settings.wsUrl).toBe('ws://provider:8000/ws');
      expect(model.settings.connectionTimeout).toBe(30000);
      expect(model.settings.sessionId).toBe('model-session');
      expect(model.settings.responseTimeout).toBe(60000);
    });

    it('should allow model settings to override provider settings', () => {
      const provider = createGooseWeb({
        wsUrl: 'ws://provider:8000/ws',
        sessionId: 'provider-session',
      });
      
      const model = provider('goose', {
        wsUrl: 'ws://model:9000/ws',
        sessionId: 'model-session',
      });
      
      // Model settings should override provider settings
      expect(model.settings.wsUrl).toBe('ws://model:9000/ws');
      expect(model.settings.sessionId).toBe('model-session');
    });

    describe('languageModel method', () => {
      it('should create language model', () => {
        const provider = createGooseWeb();
        const model = provider.languageModel('goose');
        
        expect(model).toBeInstanceOf(GooseWebLanguageModel);
        expect(model.modelId).toBe('goose');
      });
    });

    describe('chat method', () => {
      it('should create chat model (alias for languageModel)', () => {
        const provider = createGooseWeb();
        const model = provider.chat('goose');
        
        expect(model).toBeInstanceOf(GooseWebLanguageModel);
        expect(model.modelId).toBe('goose');
      });
    });

    describe('textEmbeddingModel method', () => {
      it('should throw NoSuchModelError', () => {
        const provider = createGooseWeb();
        
        expect(() => provider.textEmbeddingModel('some-model')).toThrow(NoSuchModelError);
        
        try {
          provider.textEmbeddingModel('test-model');
        } catch (error) {
          expect(error).toBeInstanceOf(NoSuchModelError);
          expect((error as NoSuchModelError).modelId).toBe('test-model');
          expect((error as NoSuchModelError).modelType).toBe('textEmbeddingModel');
        }
      });
    });

    describe('imageModel method', () => {
      it('should throw NoSuchModelError', () => {
        const provider = createGooseWeb();
        
        expect(() => provider.imageModel('some-model')).toThrow(NoSuchModelError);
        
        try {
          provider.imageModel('test-model');
        } catch (error) {
          expect(error).toBeInstanceOf(NoSuchModelError);
          expect((error as NoSuchModelError).modelId).toBe('test-model');
          expect((error as NoSuchModelError).modelType).toBe('imageModel');
        }
      });
    });
  });

  describe('default gooseWeb export', () => {
    it('should be a provider instance with default settings', () => {
      expect(typeof gooseWeb).toBe('function');
      expect(typeof gooseWeb.languageModel).toBe('function');
      expect(typeof gooseWeb.chat).toBe('function');
      expect(typeof gooseWeb.textEmbeddingModel).toBe('function');
      expect(typeof gooseWeb.imageModel).toBe('function');
    });

    it('should create models with default provider', () => {
      const model = gooseWeb('goose');
      expect(model).toBeInstanceOf(GooseWebLanguageModel);
      expect(model.modelId).toBe('goose');
      expect(model.settings.wsUrl).toBe('ws://localhost:8080/ws');
    });
  });
});