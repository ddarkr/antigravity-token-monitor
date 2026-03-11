export const Uri = {
  joinPath: (base: any, ...pathSegments: string[]) => {
    return {
      ...base,
      path: `${base.path}/${pathSegments.join('/')}`
    };
  }
};
