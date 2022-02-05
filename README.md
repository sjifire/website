# Site

main site for sjifire.org

Production: [![Netlify Status](https://api.netlify.com/api/v1/badges/28bc440c-5eb0-4464-a8d8-a980573ffea2/deploy-status)](https://app.netlify.com/sites/sjifire/deploys)

## tech

- static site generator: [Eleventy](https://www.11ty.dev/)
- cms: [NetlifyCMS](https://www.netlifycms.org/)
- Image Handling: [Cloudinary](https://cloudinary.com/)
- host: [Netlify](https://www.netlify.com/)
- code/CI/Job hosting: [GitHub](https://www.github.com)

## getting started (local)

1. clone repository (`git clone git@github.com:sjifire/website.git`)
1. run `npm install`
1. run `npm test`
1. run `npm start`

## Git LFS & Netlify Large Media

Git LFS is enabled for Netlify Large Media. see `git lfs track` and `git lfs ls-files` for the latest on what is being pushed to Git LFS

## Admin access

1. for login access, use site `https://www.sjifire.org/admin`
1. for saving admin locally, you need to run a proxy. See [Netlify docs](https://www.netlifycms.org/docs/beta-features/#working-with-a-local-git-repository) for details

## Code styles

1. `npx prettier --write .`

## getting started (production)

1. setup a cloudinary account and get a URL secret
1. setup Netlify account

   - link to your GitHub repository (netlify will build from every git push by default)
   - modify Publish directory to `public`
   - Add 2 environment variables:
     - `CLOUDINARY_URL`: set to your cloudinary URL secret
     - `ELEVENTY_ENV`: set to `production`

1. setup ESO Report: used to produce daily stats updates
   setup an ad-hoc report with the following:
   - data sources: `15-01 Fire Incident Basic Module`,`15-01-2 Fire Incident Basic Module Apparatus`, and `15-01-2-1 Fire Incident Basic Module Apparatus Personnel`
   - within modify data source, in the sort tab: column sort doesn't matter, BUT make sure `Return first [x] rows` on the sort tab is set to something well above what your max expected year range is. we set it to the max `200000` and leave it there.
   - within modify data source, in the filters tab:
     - set filter: `15-01 Fire Incident Basic Module.Alarm Date Between 365DaysAgo AND Today` and set `Ask` to false
     - set filter: `And 15-01 Fire Incident Basic Module.Is Lock Equal to 1` and set `Ask` to false
   - columns:

```text
      15-01 Fire Incident Basic Module.Incident Date
      15-01 Fire Incident Basic Module.Incident Number
      15-01 Fire Incident Basic Module.Alarm Date
      15-01 Fire Incident Basic Module.Last Unit Cleared Date
      15-01 Fire Incident Basic Module.Station
      15-01 Fire Incident Basic Module.Incident Type
      15-01 Fire Incident Basic Module.Incident Type Code
      15-01-2 Fire Incident Basic Module Apparatus.Apparatus Name
      15-01-2-1 Fire Incident Basic Module Apparatus Personnel.User Login ID
      15-01-2 Fire Incident Basic Module Apparatus.Dispatched Date
      15-01-2 Fire Incident Basic Module Apparatus.En Route Date
      15-01-2 Fire Incident Basic Module Apparatus.Arrival Date
      15-01-2 Fire Incident Basic Module Apparatus.Clear Date
```

- modify column definitions so all columns which end in `Date` are of the format `General Date`
  - make sure `CSV` is selected as an export option
  - add 3 GitHub repository secrets at `Settings -> Secrets`
    - `ESO_REPORT_USERNAME`
    - `ESO_REPORT_PASSWORD`
    - `ESO_REPORT_AGENCY`
  - modify `.github/workflows/eso_stats_scrapper.yml` configuration and report_name as needed
