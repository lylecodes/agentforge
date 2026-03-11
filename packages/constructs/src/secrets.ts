/**
 * @module secrets
 *
 * SecretRef — a marker object that describes how to resolve a secret at
 * deploy time. The Agent Assembly **never** contains secret values; it
 * contains SecretRef descriptors that target compilers resolve into
 * target-native secret access (env vars, K8s Secrets, Vault, etc.).
 *
 * @see Section 2.7 of the AgentForge roadmap.
 */

import type { SecretSource } from './assembly.js';

// ─── Sentinel ───────────────────────────────────────────────────────────────

/**
 * Marker property used to identify serialized SecretRef objects in JSON.
 * Presence of this property (set to `true`) signals that the surrounding
 * object is a secret reference, not a literal value.
 */
const SECRET_REF_MARKER = '__agentforge_secret_ref__' as const;

// ─── SecretRef Class ────────────────────────────────────────────────────────

/**
 * A reference to a secret value resolved at deploy time.
 *
 * SecretRef objects are placed in construct properties wherever a secret
 * (API key, token, password) is needed. During build, the synthesis engine
 * serializes them into the assembly as marker objects. Target compilers
 * then translate the marker into target-native secret access.
 *
 * @example
 * ```ts
 * const model = new Model(stack, 'Claude', {
 *   provider: 'anthropic',
 *   modelId: 'claude-sonnet-4',
 *   apiKey: SecretRef.env('ANTHROPIC_API_KEY'),
 * });
 * ```
 */
export class SecretRef {
  /** The resolution strategy for this secret. */
  public readonly source: SecretSource;

  /** Human-readable name for this secret (used in diagnostics). */
  public readonly name: string;

  private constructor(name: string, source: SecretSource) {
    this.name = name;
    this.source = source;
  }

  // ─── Factory Methods ────────────────────────────────────────────────

  /**
   * Resolve the secret from an environment variable.
   *
   * @param variableName - The environment variable name.
   * @returns A SecretRef that resolves from the environment.
   *
   * @example
   * ```ts
   * SecretRef.env('ANTHROPIC_API_KEY')
   * ```
   */
  static env(variableName: string): SecretRef {
    return new SecretRef(variableName, { type: 'env', variableName });
  }

  /**
   * Resolve the secret from a file on disk.
   *
   * @param filePath - Path to the secret file.
   * @param opts     - Optional encoding (defaults to utf-8).
   * @returns A SecretRef that resolves from a file.
   *
   * @example
   * ```ts
   * SecretRef.file('/run/secrets/api-key')
   * SecretRef.file('./certs/key.pem', { encoding: 'base64' })
   * ```
   */
  static file(filePath: string, opts?: { encoding?: 'utf-8' | 'base64' }): SecretRef {
    return new SecretRef(
      filePath,
      { type: 'file', filePath, encoding: opts?.encoding },
    );
  }

  /**
   * Resolve the secret from HashiCorp Vault.
   *
   * @param path - Vault secret path.
   * @param key  - Optional key within the secret.
   * @returns A SecretRef that resolves from Vault.
   *
   * @example
   * ```ts
   * SecretRef.vault('secret/data/api-keys', 'anthropic')
   * ```
   */
  static vault(path: string, key?: string): SecretRef {
    return new SecretRef(
      key ? `${path}#${key}` : path,
      { type: 'vault', provider: 'hashicorp', path, key },
    );
  }

  /**
   * Resolve the secret from AWS Secrets Manager.
   *
   * @param secretId - The secret ID or ARN.
   * @param opts     - Optional version stage.
   * @returns A SecretRef that resolves from AWS Secrets Manager.
   *
   * @example
   * ```ts
   * SecretRef.awsSecretsManager('prod/api-keys/anthropic')
   * ```
   */
  static awsSecretsManager(
    secretId: string,
    opts?: { versionStage?: string },
  ): SecretRef {
    return new SecretRef(
      secretId,
      { type: 'aws_secrets_manager', secretId, versionStage: opts?.versionStage },
    );
  }

  /**
   * Resolve the secret from a Kubernetes Secret resource.
   *
   * @param name      - K8s Secret name.
   * @param key       - Key within the Secret data.
   * @param opts      - Optional namespace (defaults to current namespace).
   * @returns A SecretRef that resolves from a K8s Secret.
   *
   * @example
   * ```ts
   * SecretRef.k8sSecret('api-keys', 'anthropic-key', { namespace: 'agents' })
   * ```
   */
  static k8sSecret(
    name: string,
    key: string,
    opts?: { namespace?: string },
  ): SecretRef {
    return new SecretRef(
      `${name}/${key}`,
      { type: 'k8s_secret', name, namespace: opts?.namespace, key },
    );
  }

  /**
   * Resolve the secret from Azure Key Vault.
   *
   * @param vaultUrl   - The Key Vault URL.
   * @param secretName - The secret name within the vault.
   * @returns A SecretRef that resolves from Azure Key Vault.
   *
   * @example
   * ```ts
   * SecretRef.azureKeyVault('https://my-vault.vault.azure.net', 'anthropic-key')
   * ```
   */
  static azureKeyVault(vaultUrl: string, secretName: string): SecretRef {
    return new SecretRef(
      secretName,
      { type: 'azure_key_vault', vaultUrl, secretName },
    );
  }

  // ─── Serialization ──────────────────────────────────────────────────

  /**
   * Serialize to the assembly JSON format.
   *
   * The output uses the `__agentforge_secret_ref__` marker so that
   * target compilers and tooling can identify secret references in the
   * assembly JSON without knowing the full schema.
   *
   * @returns A plain object suitable for JSON serialization.
   *
   * @example
   * ```json
   * {
   *   "__agentforge_secret_ref__": true,
   *   "source": { "type": "env", "variableName": "ANTHROPIC_API_KEY" }
   * }
   * ```
   */
  toJSON(): SecretRefJSON {
    return {
      [SECRET_REF_MARKER]: true,
      source: this.source,
    };
  }

  /** String representation for debugging. */
  toString(): string {
    return `SecretRef(${this.source.type}:${this.name})`;
  }
}

// ─── Serialization Type ─────────────────────────────────────────────────────

/**
 * The JSON shape of a serialized SecretRef.
 */
export interface SecretRefJSON {
  readonly __agentforge_secret_ref__: true;
  readonly source: SecretSource;
}

// ─── Type Guard ─────────────────────────────────────────────────────────────

/**
 * Type guard that checks whether a value is a {@link SecretRef} instance.
 */
export function isSecretRef(value: unknown): value is SecretRef {
  return value instanceof SecretRef;
}

/**
 * Type guard that checks whether a plain object is a serialized SecretRef
 * (i.e., contains the `__agentforge_secret_ref__` marker).
 */
export function isSecretRefJSON(value: unknown): value is SecretRefJSON {
  return (
    typeof value === 'object' &&
    value !== null &&
    SECRET_REF_MARKER in value &&
    (value as Record<string, unknown>)[SECRET_REF_MARKER] === true
  );
}
