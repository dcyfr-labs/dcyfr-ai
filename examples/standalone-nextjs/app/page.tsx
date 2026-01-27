/**
 * Standalone Next.js Example with @dcyfr/ai
 */

export default function Home() {
  return (
    <main className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold mb-6">
          @dcyfr/ai Standalone Example
        </h1>
        
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-8">
          <h2 className="text-xl font-semibold mb-2">✅ Framework Integrated</h2>
          <p className="text-gray-700">
            This Next.js app demonstrates @dcyfr/ai framework usage without DCYFR dependencies.
          </p>
        </div>
        
        <div className="space-y-6">
          <section>
            <h2 className="text-2xl font-bold mb-3">Features</h2>
            <ul className="list-disc list-inside space-y-2">
              <li>Configuration management via package.json</li>
              <li>Telemetry tracking for AI agents</li>
              <li>Custom validation plugins</li>
              <li>Multi-provider AI with fallback</li>
              <li>CLI integration</li>
            </ul>
          </section>
          
          <section>
            <h2 className="text-2xl font-bold mb-3">Try It Out</h2>
            <div className="space-y-3">
              <div className="bg-gray-100 rounded p-4">
                <code className="text-sm">npm run validate</code>
                <p className="text-gray-600 mt-2">Run custom validation checks</p>
              </div>
              
              <div className="bg-gray-100 rounded p-4">
                <code className="text-sm">npm run telemetry:report</code>
                <p className="text-gray-600 mt-2">View AI usage analytics</p>
              </div>
            </div>
          </section>
          
          <section>
            <h2 className="text-2xl font-bold mb-3">Documentation</h2>
            <ul className="list-disc list-inside space-y-2">
              <li>
                <a href="https://github.com/dcyfr/dcyfr-ai/blob/main/docs/GETTING-STARTED.md" className="text-blue-600 hover:underline">
                  Getting Started Guide
                </a>
              </li>
              <li>
                <a href="https://github.com/dcyfr/dcyfr-ai/blob/main/docs/API.md" className="text-blue-600 hover:underline">
                  API Reference
                </a>
              </li>
              <li>
                <a href="https://github.com/dcyfr/dcyfr-ai/blob/main/examples" className="text-blue-600 hover:underline">
                  More Examples
                </a>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </main>
  );
}
