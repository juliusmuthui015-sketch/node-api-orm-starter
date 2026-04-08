import { ServiceProvider } from '@/eloquent/Providers/ServiceProvider';
import { DocsUI } from '@/eloquent/Router/DocsUI';
export class DocServiceProvider extends ServiceProvider {
    register(): void {}
    boot(): void {
        if (!this.isDocsEnabled()) return;
        const expressApp = this.app.getExpressApp();
        const basePath = process.env.DOCS_PATH || '/docs';
        const specOptions = {
            title: process.env.DOCS_TITLE || 'API Documentation',
            description: process.env.DOCS_DESCRIPTION || 'Auto-generated API documentation',
            version: process.env.DOCS_VERSION || process.env.npm_package_version || '1.0.0',
            serverUrl: process.env.DOCS_SERVER_URL,
        };
        expressApp.get(`${basePath}/openapi.json`, DocsUI.specHandler(specOptions));
        expressApp.get(basePath, DocsUI.uiHandler({
            title: specOptions.title,
            theme: (process.env.DOCS_THEME as any) || 'kepler',
        }));
        console.log(`📚 API Documentation available at ${basePath}`);
    }
    private isDocsEnabled(): boolean {
        const envFlag = process.env.DOCS_ENABLED;
        if (envFlag !== undefined) {
            return envFlag.toLowerCase() === 'true' || envFlag === '1';
        }
        return process.env.NODE_ENV !== 'production';
    }
}
