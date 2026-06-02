export default function OfflinePage() {
  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
      <div className="max-w-md text-center space-y-4">
        <div className="inline-flex items-center justify-center rounded-full bg-primary/10 px-4 py-1 text-sm font-medium text-primary">
          Offline
        </div>
        <h1 className="text-3xl font-semibold">We are having trouble connecting.</h1>
        <p className="text-muted-foreground">
          Please check your internet connection and try again.
        </p>
      </div>
    </main>
  );
}
