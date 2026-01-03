# Collect.Design API

## What is Collect.Design

Collect.Design is a tool that allows designers to search for web design inspiration browsing through a collection of 20,000+ websites with screenshots for each of their most interesting pages.

It allows designers to create collections, like sites, export them to images and to build new design by taking into inspiration from the most exciting web designs around the web.

Collect.Design has a powerful search engine which makes it the "Google of Web Design" and allows searching sites and pages via their technologies, their colors, their industries, their styles, their content and many more dimensions.

## What is this project

This project is the API upon which the Collect.Design tool is based on. It acts as the data warehouse where sites are created, organized and orchestrates different tasks to augment the dataset with attributes that are fetched from different existing APIs.

The main Collect.Design tool is then consuming this API to build its web pages and handle any user facing features, the later being handled by its own separate API.

This API is mainly concerned about the creation, update and deletion of sites, pages, etc., ie. the lifecycle of those resources. They are consumed downstream by various parts of the system out of the scope of this API.

## Specifications

This API handles the creation, deletion and updates of every resources that Collect.Design consumes.

Here are the different resources:

| Resource name                                       | Resource description                                                                                                                                                                                                                    |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| domain                                              | A domain is the top-most hierarchical level when we want to add a new site to Collect.Design API. It is in the form `https://domain.com` without any child paths. Each domain should be unique.                                         |
| url                                                 | A url is an individual URL belonging to a domain. Each domain can have multiple urls. Those urls are found via a specialized service that derives them from the domain. Each url have a type that look like "homepage", "contact", etc. |
| screenshot                                          | A screenshot belongs to a url and is the image of the url that was screenshotted.                                                                                                                                                       |
| crawled_url (better resource name may be discussed) | Each url may be crawled a number of times with different results, different screenshots, different categories, etc. This resources serves as an intermediary holder that links all those resources to the url.                          |

Whenever we have categories, types, technologies, etc, which have a fixed set of possible outcomes that can grow over time, we should also have a resource for it so that we can add extra info for them, create pages specific to them, etc.

When we query a domain, we are expected to get back a number of urls, each urls having multiple crawls that themselves have multiple informations like their screenshot, their category, their content, their summary, their colors, etc.

For the end user, they can experience this with a timeline-like UI that allows them to see a site at different points in time to see what has changed over time. This applies to urls too.

It should be made clear how this is handled cleanly, who holds the date, who holds the informations, and so on and so forth.

For each domain that we have, we want to have some top level informations like the site name, what it is about, what are its main colors, what is the style of the website, etc.

We don't know yet if this information will be stored at the domain level or if we will have another resource holding those, or if they will be derived from the different crawls of the different urls.

This API should be REST first, but also provide a GraphQL endpoint that allows getting some specific information and dive deep into the hierarchy of resources.

From the end user perspective, those actions should be possible and should mostly be reflected in the API structure (sites is used interchangeably with domains):

- Get N latest sites in the homepage, for each one see the screenshot of the homepage, the url, the category of the site
- Get N latest sites of a specific category, specific industry, specific technology, etc.
- For a site, see the latest screenshots and informations for their interesting urls
- Same as above but at any point in time, so that we can see what the site looked like one month ago, one year ago, etc depending on the frequency of the crawl
- For a specific url, see all the information like the summary, the page purpose, the page colors, etc.

## Technical requirements

- All the code for this project should be written using ES6 syntax.
- The server for the API should be written using Fastify and make smart use of its plugins architecture to make developing new features smooth.
- The API should be built using Prisma as its ORM. It should run on SQLite for development and run on MySQL for production.
- All env variables should be handled with dotenv.
- The project should follow the 12 factors best practices.
- The project should be ready to be dockerized and run on docker compatible runtimes (Kubernetes, Cloud Run, etc.)
- All routes must be thoroughly validated and error handled so that we always know when something goes wrong.
- A lot of the data fetching for the different informations about a URL can fail at some point. Resilience should be built from day one with a durable execution engine like restate.
- Urls will have no information at first when created while their informations are fetched. We should provide clean responses for them that showcase was is currently going on so that downstream consumers know what to do with those resources.
- Error handling should look the same accros the API, as do the API responses.
- The API should have observability built in so that we can have smart insights about what is actually going on, what routes are slow, what works great, what breaks, etc.
- For GraphQL resources and REST endpoints, whenever we do the same things, we should build a controller or a service to do it. So for example if we can query sites, we should have a SitesService or something like this that exposes a method to do it, and use that instead of direct Prisma manipulation.
- The code is formatted with prettier and should always obey its standards

## 3rd party tools

You have access to the following libraries which you may use when necessary:

- @jverneaut/mb-screenshotter: A package that allows taking high quality screenshots of an url
- @jverneaut/mb-pages-finder: A package that allows finding the most interesting pages of a site with their categorizes (homepage, about-us, contact, etc.)
- @jverneaut/mb-technologies-finder: A package that allows finding which technologies a site is built with, using Wappalyzer behind the scenes
- @jverneaut/mb-shopify-theme-detector: A package that allows finding informations about the theme for a Shopify site
