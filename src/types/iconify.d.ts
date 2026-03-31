import "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "iconify-icon": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          icon?: string;
          width?: string | number;
          height?: string | number;
          inline?: boolean;
          flip?: string;
          rotate?: string;
        },
        HTMLElement
      >;
    }
  }
}
