import { describe, it, expect } from 'vitest';
import { SecretRef, isSecretRef, isSecretRefJSON } from '../secrets.js';
import type { SecretRefJSON } from '../secrets.js';

// ─── Factory Methods ─────────────────────────────────────────────────────────

describe('SecretRef.env', () => {
  it('creates a secret ref with env source', () => {
    const ref = SecretRef.env('ANTHROPIC_API_KEY');
    expect(ref.name).toBe('ANTHROPIC_API_KEY');
    expect(ref.source).toEqual({ type: 'env', variableName: 'ANTHROPIC_API_KEY' });
  });
});

describe('SecretRef.file', () => {
  it('creates a secret ref with file source (default encoding)', () => {
    const ref = SecretRef.file('/run/secrets/api-key');
    expect(ref.name).toBe('/run/secrets/api-key');
    expect(ref.source).toEqual({
      type: 'file',
      filePath: '/run/secrets/api-key',
      encoding: undefined,
    });
  });

  it('creates a secret ref with file source (base64 encoding)', () => {
    const ref = SecretRef.file('./certs/key.pem', { encoding: 'base64' });
    expect(ref.source).toEqual({
      type: 'file',
      filePath: './certs/key.pem',
      encoding: 'base64',
    });
  });
});

describe('SecretRef.vault', () => {
  it('creates a secret ref with vault source (path only)', () => {
    const ref = SecretRef.vault('secret/data/api-keys');
    expect(ref.name).toBe('secret/data/api-keys');
    expect(ref.source).toEqual({
      type: 'vault',
      provider: 'hashicorp',
      path: 'secret/data/api-keys',
      key: undefined,
    });
  });

  it('creates a secret ref with vault source (path + key)', () => {
    const ref = SecretRef.vault('secret/data/api-keys', 'anthropic');
    expect(ref.name).toBe('secret/data/api-keys#anthropic');
    expect(ref.source).toEqual({
      type: 'vault',
      provider: 'hashicorp',
      path: 'secret/data/api-keys',
      key: 'anthropic',
    });
  });
});

describe('SecretRef.awsSecretsManager', () => {
  it('creates a secret ref with AWS Secrets Manager source', () => {
    const ref = SecretRef.awsSecretsManager('prod/api-keys/anthropic');
    expect(ref.name).toBe('prod/api-keys/anthropic');
    expect(ref.source).toEqual({
      type: 'aws_secrets_manager',
      secretId: 'prod/api-keys/anthropic',
      versionStage: undefined,
    });
  });

  it('supports versionStage option', () => {
    const ref = SecretRef.awsSecretsManager('my-secret', {
      versionStage: 'AWSCURRENT',
    });
    expect(ref.source).toEqual({
      type: 'aws_secrets_manager',
      secretId: 'my-secret',
      versionStage: 'AWSCURRENT',
    });
  });
});

describe('SecretRef.k8sSecret', () => {
  it('creates a secret ref with K8s secret source', () => {
    const ref = SecretRef.k8sSecret('api-keys', 'anthropic-key');
    expect(ref.name).toBe('api-keys/anthropic-key');
    expect(ref.source).toEqual({
      type: 'k8s_secret',
      name: 'api-keys',
      namespace: undefined,
      key: 'anthropic-key',
    });
  });

  it('supports namespace option', () => {
    const ref = SecretRef.k8sSecret('api-keys', 'anthropic-key', {
      namespace: 'agents',
    });
    expect(ref.source).toEqual({
      type: 'k8s_secret',
      name: 'api-keys',
      namespace: 'agents',
      key: 'anthropic-key',
    });
  });
});

describe('SecretRef.azureKeyVault', () => {
  it('creates a secret ref with Azure Key Vault source', () => {
    const ref = SecretRef.azureKeyVault(
      'https://my-vault.vault.azure.net',
      'anthropic-key',
    );
    expect(ref.name).toBe('anthropic-key');
    expect(ref.source).toEqual({
      type: 'azure_key_vault',
      vaultUrl: 'https://my-vault.vault.azure.net',
      secretName: 'anthropic-key',
    });
  });
});

// ─── Serialization ───────────────────────────────────────────────────────────

describe('SecretRef.toJSON', () => {
  it('serializes to the expected marker format', () => {
    const ref = SecretRef.env('MY_KEY');
    const json = ref.toJSON();
    expect(json).toEqual({
      __agentforge_secret_ref__: true,
      source: { type: 'env', variableName: 'MY_KEY' },
    });
  });

  it('is JSON.stringify-safe', () => {
    const ref = SecretRef.vault('path', 'key');
    const serialized = JSON.stringify(ref);
    const parsed = JSON.parse(serialized) as SecretRefJSON;
    expect(parsed.__agentforge_secret_ref__).toBe(true);
    expect(parsed.source.type).toBe('vault');
  });
});

describe('SecretRef.toString', () => {
  it('returns a human-readable debug string', () => {
    const ref = SecretRef.env('API_KEY');
    expect(ref.toString()).toBe('SecretRef(env:API_KEY)');
  });

  it('includes the source type', () => {
    const ref = SecretRef.vault('path', 'key');
    expect(ref.toString()).toBe('SecretRef(vault:path#key)');
  });
});

// ─── Type Guards ─────────────────────────────────────────────────────────────

describe('isSecretRef', () => {
  it('returns true for SecretRef instances', () => {
    expect(isSecretRef(SecretRef.env('KEY'))).toBe(true);
    expect(isSecretRef(SecretRef.file('/path'))).toBe(true);
    expect(isSecretRef(SecretRef.vault('path'))).toBe(true);
  });

  it('returns false for non-SecretRef values', () => {
    expect(isSecretRef('string')).toBe(false);
    expect(isSecretRef(42)).toBe(false);
    expect(isSecretRef(null)).toBe(false);
    expect(isSecretRef(undefined)).toBe(false);
    expect(isSecretRef({})).toBe(false);
    expect(isSecretRef({ __agentforge_secret_ref__: true })).toBe(false);
  });
});

describe('isSecretRefJSON', () => {
  it('returns true for serialized SecretRef JSON objects', () => {
    const json = SecretRef.env('KEY').toJSON();
    expect(isSecretRefJSON(json)).toBe(true);
  });

  it('returns true for manually constructed marker objects', () => {
    const obj = {
      __agentforge_secret_ref__: true,
      source: { type: 'env', variableName: 'KEY' },
    };
    expect(isSecretRefJSON(obj)).toBe(true);
  });

  it('returns false when marker is not true', () => {
    expect(isSecretRefJSON({ __agentforge_secret_ref__: false })).toBe(false);
    expect(isSecretRefJSON({ __agentforge_secret_ref__: 'yes' })).toBe(false);
  });

  it('returns false for non-objects', () => {
    expect(isSecretRefJSON('string')).toBe(false);
    expect(isSecretRefJSON(null)).toBe(false);
    expect(isSecretRefJSON(undefined)).toBe(false);
    expect(isSecretRefJSON(42)).toBe(false);
  });

  it('returns false for plain objects without marker', () => {
    expect(isSecretRefJSON({})).toBe(false);
    expect(isSecretRefJSON({ source: { type: 'env' } })).toBe(false);
  });
});
