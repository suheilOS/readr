type TwinOrbitProps = {
  className?: string;
  label?: string;
};

function TwinOrbit({ className, label = "Loading" }: TwinOrbitProps) {
  const classes = className ? `twin-orbit ${className}` : "twin-orbit";

  return (
    <span className={classes} role="status">
      <span className="twin-orbit__dot" aria-hidden="true" />
      <span className="visually-hidden">{label}</span>
    </span>
  );
}

export { TwinOrbit };
