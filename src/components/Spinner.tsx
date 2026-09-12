type SpinnerProps = {
  className?: string;
  label?: string;
};

function Spinner({ className, label = "Loading" }: SpinnerProps) {
  const classes = className ? `spinner ${className}` : "spinner";

  return (
    <span className={classes} role="status">
      <span className="visually-hidden">{label}</span>
    </span>
  );
}

export { Spinner };
