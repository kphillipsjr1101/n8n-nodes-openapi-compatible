# n8n-nodes-openapi-compatible

This is an n8n community node. It lets you use Swagger/OpenAPI capable endpoints in your n8n workflows.

@kphillipsjr1101/n8n-nodes-openapi-compatible is a community node for [n8n](https://n8n.io/). It lets you use Swagger/OpenAPI capable endpoints in your n8n workflows. 🚀

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/reference/license/) workflow automation platform.

[Installation](#installation)  
[Operations](#operations)  
[Credentials](#credentials)  <!-- delete if no auth needed -->  
[Compatibility](#compatibility)  
[Usage](#usage)  <!-- delete if not using this section -->  
[Resources](#resources)  
[Version history](#version-history)  <!-- delete if not using this section -->  

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

## Operations

Operations are queried dynamically from the remote Swagger/OpenAPI endpoint. The available operations are determined by the endpoint's schema.

## Credentials

Credentials are ✨ _optional_ ✨ but much cleaner than manually building headers and the like. You can use them to authenticate with the remote endpoint. Only some basic types of authentication are supported at this time. You will need to work around this limitation for authentication like OAuth2.

When you create the credentials, it will ask you for the value of the authentication type you're using. Fill out the fields where appropriate. If you're not sure, you don't have to add a credential here. You can just add the values directly to the headers or query parameters in the node. Just make sure to refer to the documentation of the endpoint you're using. 📑
![image](https://github.com/user-attachments/assets/2cb27b3a-5e03-4bdd-ad9f-52de6dd8f803)


## Compatibility

This node was tested with the following n8n version:
1.83.2

## Usage

Should be relatively self explanatory once you've added the node to your flow. Fill out the fields as needed. If you're not sure what to put in a field, refer to the documentation of the endpoint you're using. 📑

![image](https://github.com/user-attachments/assets/44454deb-1613-4a5f-9873-6f77d71458fa)

In some cases a remote endpoint may not provide a baseUrl or you may want to develop and test against a different environment. You can set the baseUrl in the node settings. This will override the baseUrl provided by the remote endpoint.
Once you have filled out the spec URL, on operations you can click the dots and refresh to get a dynamic list of valid API endpoints from the spec.

![image](https://github.com/user-attachments/assets/59dc9389-266a-4fb3-ab3a-90e3afb61b9a)


This does not currently populate the parameters for the operation, so you will need to refer to the documentation of the endpoint you're using to know what parameters are required. This was just a quick handjam to get something working. I will be adding more features as I have time. Feel free to contribute!

## Resources

* [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)
* [n8n.io](https://n8n.io/)
* [n8n-node-openapi-compatible](https://github.com/kphillipsjr1101/n8n-nodes-openapi-compatible)
* [OpenAPI Specification](https://github.com/OAI/OpenAPI-Specification)
