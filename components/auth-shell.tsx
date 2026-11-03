import { LogoMark } from "@/components/icons";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="grid min-h-dvh bg-paper lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <aside className="console-bg relative hidden items-center justify-center overflow-hidden p-10 lg:flex">
        <LogoMark className="size-20" />
      </aside>

      <section className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <LogoMark className="size-10" />
          </div>
          {children}
        </div>
      </section>
    </main>
  );
}

export function AuthHeading({ title }: { title: string }) {
  return (
    <div className="mb-7">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
    </div>
  );
}
