/**
 * PermissionCard — renders a permission request with action buttons.
 */
import { useInspectorStore } from '../stores/inspector-store';
import { Button } from './ui';
import type { PermissionRequest } from '../../../shared/types';

interface PermissionOption {
  readonly optionId: string;
  readonly name: string;
  readonly kind: string;
}

export function PermissionCard({ request }: { readonly request: PermissionRequest }): React.JSX.Element {
  const respondPermission = useInspectorStore((s) => s.respondPermission);
  const responded = request.respondedOptionId !== undefined;

  // Extract options from the raw ACP data
  const data = request.data as Record<string, unknown>;
  const options = (data.options ?? []) as readonly PermissionOption[];
  const toolCall = data.toolCall as Record<string, unknown> | undefined;
  const title = (toolCall?.title as string | undefined) ?? 'Permission Request';

  return (
    <div
      className={`my-2 rounded-md border p-3 ${responded ? 'border-success/30 bg-success/5' : 'border-warning/30 bg-warning/5'}`}
    >
      <div className={`mb-2 text-xs font-medium ${responded ? 'text-success' : 'text-warning'}`}>
        {title}
        {responded && <span className="ml-2 font-normal text-muted-foreground">— responded</span>}
      </div>
      {typeof toolCall?.description === 'string' && (
        <div className="mb-2 text-xs text-muted-foreground">{toolCall.description}</div>
      )}
      <pre className="mb-2 whitespace-pre-wrap break-all text-xs text-muted-foreground">
        {JSON.stringify(request.data, null, 2)}
      </pre>
      <div className="flex gap-2">
        {options.map((opt) => (
          <Button
            key={opt.optionId}
            variant={responded && opt.optionId === request.respondedOptionId ? 'success' : 'outline'}
            disabled={responded}
            onClick={() => void respondPermission(request.requestId, opt.optionId)}
          >
            {opt.name}
          </Button>
        ))}
      </div>
    </div>
  );
}
