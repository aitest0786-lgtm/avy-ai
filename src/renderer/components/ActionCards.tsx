import React from "react";
import { SuggestedWebsite } from "../types";
import { ExternalLink, Globe, Sparkles } from "lucide-react";

interface ActionCardsProps {
  websites: SuggestedWebsite[];
}

export const ActionCards: React.FC<ActionCardsProps> = ({ websites }) => {
  if (websites.length === 0) return null;

  return (
    <div className="w-full max-w-md mx-auto mt-8 px-4" id="action-cards-container">
      <div className="flex items-center gap-2 mb-3 text-slate-300 px-1" id="action-cards-header">
        <Sparkles className="w-4 h-4 text-cyan-400" />
        <h2 className="text-sm font-semibold tracking-wide uppercase font-sans text-slate-300">
          Avy's Suggested Sites
        </h2>
      </div>

      <div className="space-y-3" id="suggested-websites-list">
        {websites.map((site, index) => (
          <a
            key={`${site.url}-${index}`}
            href={site.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between p-4 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-cyan-500/30 transition-all duration-300 group shadow-md backdrop-blur-md active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            style={{ minHeight: "56px" }} // ensures high-accessibility tap targets
            id={`suggested-website-${index}`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-900/60 flex items-center justify-center border border-white/5 text-cyan-400 group-hover:text-white transition-colors duration-300">
                <Globe className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p className="text-sm font-semibold text-white group-hover:text-cyan-300 transition-colors duration-300">
                  {site.siteName}
                </p>
                <p className="text-xs text-slate-400 truncate max-w-[180px] sm:max-w-[240px]">
                  {site.url.replace(/^https?:\/\/(www\.)?/, '')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-slate-500 bg-slate-950/40 px-2 py-0.5 rounded-full border border-white/5">
                {site.timestamp}
              </span>
              <ExternalLink className="w-4 h-4 text-slate-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform duration-300" />
            </div>
          </a>
        ))}
      </div>
    </div>
  );
};
