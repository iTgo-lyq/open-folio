import "server-only";
import { GitHubProvider } from "./github.ts";
import { ProviderError, type RepositoryProvider } from "./types.ts";
export class ProviderRegistry {
  #providers: Map<string, RepositoryProvider>;
  constructor(providers: RepositoryProvider[]) {
    this.#providers = new Map(providers.map((p) => [p.id, p]));
    if (this.#providers.size !== providers.length)
      throw new Error("Duplicate provider registration");
  }
  get(id: string): RepositoryProvider {
    const provider = this.#providers.get(id);
    if (!provider)
      throw new ProviderError(
        "PROVIDER_UNSUPPORTED",
        "暂不支持此代码托管服务。",
        400,
      );
    return provider;
  }
  describe() {
    return [...this.#providers.values()].map((p) => p.describeConnection());
  }
}
export const providers = new ProviderRegistry([new GitHubProvider()]);
