import { Fragment, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import "./DetailsPage.scss";

export type DetailsPageBreadcrumb = {
  label: string;
  to?: string;
};

type DetailsPageProps = {
  breadcrumbs: readonly DetailsPageBreadcrumb[];
  busy?: boolean;
  children?: ReactNode;
  className?: string;
  content: ReactNode;
  contentClassName?: string;
  headerAside?: ReactNode;
  media: ReactNode;
  mediaClassName?: string;
  notice?: ReactNode;
  overlay?: ReactNode;
  title: ReactNode;
  titleMeta?: ReactNode;
};

function withClassName(baseClassName: string, className?: string) {
  return className ? `${baseClassName} ${className}` : baseClassName;
}

export function DetailsPage({
  breadcrumbs,
  busy = false,
  children,
  className,
  content,
  contentClassName,
  headerAside,
  media,
  mediaClassName,
  notice,
  overlay,
  title,
  titleMeta,
}: DetailsPageProps) {
  return (
    <article className={withClassName("details-page", className)}>
      <div className="details-page__primary">
        {notice}

        <nav aria-label="Breadcrumb" className="details-page__breadcrumb">
          {breadcrumbs.map((breadcrumb, index) => {
            const current = index === breadcrumbs.length - 1;
            const intermediate = index > 0 && !current;

            return (
              <Fragment key={`${breadcrumb.label}-${index}`}>
                {current ? (
                  <strong aria-current="page">{breadcrumb.label}</strong>
                ) : breadcrumb.to ? (
                  <Link
                    className={
                      intermediate
                        ? "details-page__breadcrumb-link details-page__breadcrumb-link--intermediate"
                        : "details-page__breadcrumb-link"
                    }
                    to={breadcrumb.to}
                  >
                    {breadcrumb.label}
                  </Link>
                ) : (
                  <span className="details-page__breadcrumb-link">
                    {breadcrumb.label}
                  </span>
                )}
                {!current && (
                  <ChevronRight
                    aria-hidden="true"
                    className={
                      intermediate
                        ? "details-page__breadcrumb-separator details-page__breadcrumb-separator--after-intermediate"
                        : "details-page__breadcrumb-separator"
                    }
                  />
                )}
              </Fragment>
            );
          })}
        </nav>

        <div aria-busy={busy || undefined} className="details-page__shell">
          <header className="details-page__identity">
            <div className="details-page__title-row">
              <h1 className="details-page__title">{title}</h1>
              {titleMeta}
            </div>
            {headerAside && (
              <div className="details-page__header-aside">{headerAside}</div>
            )}
          </header>

          <div className="details-page__body">
            <div
              className={withClassName("details-page__media", mediaClassName)}
            >
              {media}
            </div>
            <div
              className={withClassName(
                "details-page__content",
                contentClassName,
              )}
            >
              {content}
            </div>
          </div>

          {overlay}
        </div>
      </div>

      {children}
    </article>
  );
}
