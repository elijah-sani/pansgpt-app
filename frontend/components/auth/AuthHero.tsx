import { TAGLINES } from './authConstants';

type AuthHeroProps = {
  taglineFading: boolean;
  taglineIndex: number;
  onSelectTagline: (index: number) => void;
};

export function AuthHero({ taglineFading, taglineIndex, onSelectTagline }: AuthHeroProps) {
  return (
    <>
      <div className="hidden lg:flex absolute inset-0 flex-col justify-between p-12 overflow-hidden">
        <div className="flex items-center gap-2.5 z-10 w-fit auth-fade-up">
          <img src="/icon.svg" alt="PansGPT icon" className="h-8 w-8 object-contain" />
          <span className="text-white text-xl font-bold" style={{ fontFamily: 'var(--font-albert-sans, Albert Sans, sans-serif)' }}>
            PansGPT
          </span>
        </div>

        <div className="absolute top-[18%] left-[33%] -translate-x-1/2 w-[920px] h-[920px] pointer-events-none z-10 auth-art-enter">
          <svg viewBox="0 0 827.58 887.58" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
            <defs>
              <filter id="glow">
                <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <style>{`
                .base-stroke {
                  fill: none;
                  stroke: #21c95a;
                  stroke-miterlimit: 10;
                  stroke-width: 2;
                  opacity: 0.42;
                }
                .glow-stroke {
                  fill: none;
                  stroke: #00ff44;
                  stroke-miterlimit: 10;
                  stroke-width: 3;
                  filter: url(#glow);
                  stroke-dasharray: 360 1840;
                  stroke-dashoffset: 0;
                  opacity: 0.68;
                }
                .glow-stroke-1 { stroke-dashoffset: 0; animation: dash-move 6s linear infinite; }
                .glow-stroke-2 { stroke-dashoffset: -730; animation: dash-move 6s linear infinite; }
                .glow-stroke-3 { stroke-dashoffset: -1460; animation: dash-move 6s linear infinite; }
                @keyframes dash-move {
                  from { stroke-dashoffset: 0; }
                  to { stroke-dashoffset: -2200; }
                }
              `}</style>
            </defs>

            <g opacity=".28">
              <path className="base-stroke" d="M563.4,563.72c-7.48,7.11-50.33-54.02-112.23-56.76-67.35-2.98-119.86,64.82-127.71,56.76-7.83-8.04,61.02-58.42,59.41-124.68-1.53-63-65.96-108.54-59.41-115.25,6.56-6.73,54.04,56.68,118.25,57.19,65.48.52,114.29-64.66,121.69-57.19,7.07,7.15-53.19,51.06-55.47,113.52-2.45,67.12,63.4,118.88,55.47,126.42Z" />
              <path className="base-stroke" d="M826.58,97.2v653.07c0,6.26-7.57,9.4-12,4.97l-92.53-92.53c-9.05-9.05-14.13-21.32-14.13-34.11v-33.29c0-11.31,13.67-16.97,21.67-8.98l30.23,30.23c2.74,2.74,7.43.8,7.43-3.08V96.87c0-20.17-16.35-36.51-36.51-36.51H224.56c-7.74,0-11.62,9.36-6.14,14.83l69.64,69.64c5.38,5.38,12.68,8.4,20.29,8.4h378.47c11.65,0,21.09,9.44,21.09,21.09v17.15c0,11.65-9.44,21.09-21.09,21.09h-409.46c-3.51,0-6.88-1.39-9.36-3.88L86.11,26.78c-9.51-9.51-2.77-25.78,10.68-25.78h633.59c53.13,0,96.2,43.07,96.2,96.2Z" />
              <path className="base-stroke" d="M809.64,886.58H249.42c-53.13,0-96.2-43.07-96.2-96.2v-484.95c0-5.73-2.28-11.22-6.33-15.28l-71-71c-5.74-5.74-15.56-1.67-15.56,6.44v487.66c0,11.65-9.44,21.09-21.09,21.09h-17.15c-11.65,0-21.09-9.44-21.09-21.09V88.79c0-10.5,12.69-15.75,20.11-8.33l185.11,185.11c4.05,4.05,6.33,9.55,6.33,15.28v509.87c0,20.17,16.35,36.51,36.51,36.51h434.92l-86.55-86.55c-4.05-4.05-9.55-6.33-15.28-6.33h-289.16c-11.65,0-21.09-9.44-21.09-21.09v-16.64c0-11.93,9.67-21.6,21.6-21.6h313.2c5.74,0,11.25,2.29,15.3,6.35l192.62,193.22c4.42,4.43,1.28,12-4.98,12Z" />
            </g>

            <path className="glow-stroke glow-stroke-1" d="M563.4,563.72c-7.48,7.11-50.33-54.02-112.23-56.76-67.35-2.98-119.86,64.82-127.71,56.76-7.83-8.04,61.02-58.42,59.41-124.68-1.53-63-65.96-108.54-59.41-115.25,6.56-6.73,54.04,56.68,118.25,57.19,65.48.52,114.29-64.66,121.69-57.19,7.07,7.15-53.19,51.06-55.47,113.52-2.45,67.12,63.4,118.88,55.47,126.42Z" />
            <path className="glow-stroke glow-stroke-2" d="M826.58,97.2v653.07c0,6.26-7.57,9.4-12,4.97l-92.53-92.53c-9.05-9.05-14.13-21.32-14.13-34.11v-33.29c0-11.31,13.67-16.97,21.67-8.98l30.23,30.23c2.74,2.74,7.43.8,7.43-3.08V96.87c0-20.17-16.35-36.51-36.51-36.51H224.56c-7.74,0-11.62,9.36-6.14,14.83l69.64,69.64c5.38,5.38,12.68,8.4,20.29,8.4h378.47c11.65,0,21.09,9.44,21.09,21.09v17.15c0,11.65-9.44,21.09-21.09,21.09h-409.46c-3.51,0-6.88-1.39-9.36-3.88L86.11,26.78c-9.51-9.51-2.77-25.78,10.68-25.78h633.59c53.13,0,96.2,43.07,96.2,96.2Z" />
            <path className="glow-stroke glow-stroke-3" d="M809.64,886.58H249.42c-53.13,0-96.2-43.07-96.2-96.2v-484.95c0-5.73-2.28-11.22-6.33-15.28l-71-71c-5.74-5.74-15.56-1.67-15.56,6.44v487.66c0,11.65-9.44,21.09-21.09,21.09h-17.15c-11.65,0-21.09-9.44-21.09-21.09V88.79c0-10.5,12.69-15.75,20.11-8.33l185.11,185.11c4.05,4.05,6.33,9.55,6.33,15.28v509.87c0,20.17,16.35,36.51,36.51,36.51h434.92l-86.55-86.55c-4.05-4.05-9.55-6.33-15.28-6.33h-289.16c-11.65,0-21.09-9.44-21.09-21.09v-16.64c0-11.93,9.67-21.6,21.6-21.6h313.2c5.74,0,11.25,2.29,15.3,6.35l192.62,193.22c4.42,4.43,1.28,12-4.98,12Z" />
          </svg>

          <div
            className="absolute inset-0 z-20"
            style={{
              background: 'linear-gradient(to bottom, transparent 0%, transparent 25%, #152012 55%, #152012 100%)'
            }}
          />
        </div>

        <div className="z-10 relative mb-12 max-w-xl auth-fade-up-delayed">
          <div className="inline-flex items-center rounded-full border border-white/15 bg-white/8 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.22em] text-white/70">
            Built for Pharmacy School
          </div>
          <p
            className="mt-5 text-lg text-white/82 font-medium leading-relaxed transition-opacity duration-400 max-w-md"
            style={{ opacity: taglineFading ? 0 : 1 }}
          >
            {TAGLINES[taglineIndex]}
          </p>
          <div className="flex gap-2 mt-6">
            {TAGLINES.map((_, index) => (
              <button
                key={index}
                onClick={() => onSelectTagline(index)}
                className={`h-1 rounded-full transition-all duration-300 ${index === taglineIndex ? 'w-8 bg-white opacity-100' : 'w-8 bg-white opacity-30'}`}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="lg:hidden relative z-10 flex flex-col items-center justify-center pt-16 pb-8 gap-3 shrink-0 auth-fade-up">
        <div className="flex items-center gap-2.5">
          <img src="/icon.svg" alt="PansGPT" className="h-9 w-9 object-contain" />
          <span className="text-white text-2xl font-bold" style={{ fontFamily: 'var(--font-albert-sans, Albert Sans, sans-serif)' }}>
            PansGPT
          </span>
        </div>
        <p className="text-white/60 text-sm font-medium px-8 text-center">
          Your AI-powered pharmacy study assistant
        </p>
      </div>
    </>
  );
}
