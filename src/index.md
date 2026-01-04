---
layout: base.njk
title: Home
---

# Welcome to Our Site

This is a static website powered by 11ty and TinaCMS, deployed to Azure.

## Latest Posts

{% for post in collections.posts | limit(3) %}
- [{{ post.data.title }}]({{ post.url }}) - {{ post.data.date | dateDisplay }}
{% endfor %}
