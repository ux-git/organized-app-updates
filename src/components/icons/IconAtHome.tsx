import { SvgIcon, SxProps, Theme } from '@mui/material';

type IconProps = {
  color?: string;
  width?: number;
  height?: number;
  sx?: SxProps<Theme>;
  className?: string;
};

const IconAtHome = ({
  color = '#222222',
  width = 24,
  height = 24,
  sx = {},
  className,
}: IconProps) => {
  return (
    <SvgIcon
      className={`organized-icon-at-home ${className}`}
      sx={{ width: `${width}px`, height: `${height}px`, ...sx }}
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <mask
          id="mask0_4443_172583"
          style={{ maskType: 'alpha' }}
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          width="24"
          height="25"
        >
          <rect y="0.000488281" width="24" height="24" fill="#D9D9D9" />
        </mask>
        <g mask="url(#mask0_4443_172583)">
          <path
            d="M12 3.61572L19.5 9.25032V20.5003H4.5V9.25032L12 3.61572ZM11.9988 14.7503C12.7624 14.7503 13.4118 14.483 13.9471 13.9485C14.4823 13.414 14.75 12.765 14.75 12.0014C14.75 11.2379 14.4827 10.5884 13.9482 10.0532C13.4137 9.51795 12.7647 9.25032 12.0011 9.25032C11.2375 9.25032 10.5881 9.51757 10.0529 10.0521C9.51762 10.5866 9.25 11.2356 9.25 11.9992C9.25 12.7627 9.51725 13.4121 10.0518 13.9474C10.5863 14.4826 11.2353 14.7503 11.9988 14.7503ZM12 13.2503C11.6525 13.2503 11.3573 13.1288 11.1144 12.8859C10.8714 12.6429 10.7499 12.3477 10.7499 12.0003C10.7499 11.6529 10.8714 11.3577 11.1144 11.1147C11.3573 10.8717 11.6525 10.7503 12 10.7503C12.3474 10.7503 12.6426 10.8717 12.8856 11.1147C13.1285 11.3577 13.25 11.6529 13.25 12.0003C13.25 12.3477 13.1285 12.6429 12.8856 12.8859C12.6426 13.1288 12.3474 13.2503 12 13.2503ZM11.9743 17.7503C11.2055 17.7503 10.4577 17.856 9.73073 18.0676C9.00379 18.2791 8.31661 18.59 7.66917 19.0003H16.2827C15.6417 18.59 14.9555 18.2791 14.2243 18.0676C13.493 17.856 12.743 17.7503 11.9743 17.7503ZM5.99997 10.0003V18.3465C6.85382 17.6708 7.78804 17.1526 8.80262 16.7917C9.81721 16.4308 10.8734 16.2503 11.9711 16.2503C13.0801 16.2503 14.1471 16.4292 15.1721 16.7868C16.1971 17.1445 17.1397 17.6612 18 18.3369V10.0003L12 5.5003L5.99997 10.0003Z"
            fill={color}
          />
        </g>
      </svg>
    </SvgIcon>
  );
};

export default IconAtHome;
