import type { CSSProperties } from "react";

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  style?: CSSProperties;
}

/** Bloco genérico de carregamento (shimmer). Componha pra imitar o formato real do conteúdo. */
export function Skeleton({ width = "100%", height = 14, style }: SkeletonProps) {
  return <span className="skeleton" style={{ width, height, ...style }} />;
}

/** Linha de tabela com N células, cada uma um skeleton de largura variável. */
export function SkeletonRow({ widths }: { widths: (string | number)[] }) {
  return (
    <tr>
      {widths.map((width, i) => (
        <td key={i}>
          <Skeleton width={width} />
        </td>
      ))}
    </tr>
  );
}
