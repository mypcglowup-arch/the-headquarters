import { AGENT_CONFIG } from '../prompts.js';

/**
 * Unified avatar component — shows photo if uploaded, otherwise a styled
 * gradient circle with the agent's initial letter.
 *
 * size: 'sm' (chat header) | 'md' (agent card on home)
 */
export default function AgentAvatar({ agentKey, photo, size = 'md' }) {
  const config = AGENT_CONFIG[agentKey];
  const isLong = config?.initial?.length > 1;
  const dim = size === 'sm'
    ? `w-9 h-9 ${isLong ? 'text-[10px]' : 'text-sm'}`
    : `w-16 h-16 ${isLong ? 'text-base' : 'text-2xl'}`;

  if (photo) {
    return (
      <img
        src={photo}
        alt={agentKey}
        className={`${dim} rounded-full object-cover flex-shrink-0`}
      />
    );
  }

  return (
    <div
      className={`${dim} rounded-full flex-shrink-0 flex items-center justify-center font-bold text-white select-none ${config.avatarGradient}`}
    >
      {config.initial}
    </div>
  );
}
